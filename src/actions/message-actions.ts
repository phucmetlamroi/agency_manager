'use server'

import { prisma } from '@/lib/db'
import { authorizeChannel, type ChannelAuthzContext } from '@/lib/channel-permissions'
import { broadcastToChannel } from '@/lib/notification-broadcast'
import { CHAT_EVENTS } from '@/lib/chat-channels'
import { createAndBroadcastNotifications } from '@/actions/notification-actions'
import { revalidatePath } from 'next/cache'

/**
 * Knowledge Hub — message read/write (server actions). Every call goes through
 * authorizeChannel() (default-deny, server-side). Persist to Neon → broadcast.
 */

const AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarUrl: true } as const
const MESSAGE_INCLUDE = {
    author: { select: AUTHOR_SELECT },
    reactions: { select: { emoji: true, userId: true } },
    attachments: {
        select: { id: true, url: true, fileName: true, mimeType: true, sizeBytes: true, width: true, height: true },
        orderBy: { createdAt: 'asc' },
    },
} as const

export interface MessageAuthorDTO {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
}
export interface ReactionDTO {
    emoji: string
    userIds: string[]
}
export interface AttachmentDTO {
    id: string
    url: string
    fileName: string
    mimeType: string
    sizeBytes: number
    width: number | null
    height: number | null
}
export interface MessageDTO {
    id: string
    channelId: string
    content: string
    authorId: string
    author: MessageAuthorDTO | null
    parentId: string | null
    replyCount: number
    reactions: ReactionDTO[]
    attachments: AttachmentDTO[]
    editedAt: string | null
    deletedAt: string | null
    createdAt: string
}

function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
    const map = new Map<string, string[]>()
    for (const r of rows) {
        if (!map.has(r.emoji)) map.set(r.emoji, [])
        map.get(r.emoji)!.push(r.userId)
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }))
}

function serialize(m: any): MessageDTO {
    return {
        id: m.id,
        channelId: m.channelId,
        content: m.deletedAt ? '' : m.content,
        authorId: m.authorId,
        author: m.author ?? null,
        parentId: m.parentId ?? null,
        replyCount: m.replyCount ?? 0,
        reactions: groupReactions(m.reactions ?? []),
        attachments: m.deletedAt
            ? []
            : (m.attachments ?? []).map((a: any) => ({
                  id: a.id,
                  url: a.url,
                  fileName: a.fileName,
                  mimeType: a.mimeType,
                  sizeBytes: a.sizeBytes,
                  width: a.width ?? null,
                  height: a.height ?? null,
              })),
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
        deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
        createdAt: new Date(m.createdAt).toISOString(),
    }
}

async function resolveProfileId(ctx: ChannelAuthzContext, workspaceId: string): Promise<string> {
    if (ctx.profileId) return ctx.profileId
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    if (!ws?.profileId) throw new Error('SECURITY_VIOLATION: workspace has no profile')
    return ws.profileId
}

/** Extract @username tokens (lowercased, deduped) from message text. */
function parseMentions(content: string): string[] {
    const re = /@([a-zA-Z0-9_.\-]{2,32})/g
    const out = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) out.add(m[1].toLowerCase())
    return Array.from(out)
}

/**
 * Create Mention rows + MENTION notifications for @username tokens, SCOPED to the
 * channel's members + workspace OWNER/ADMINs (previously matched ALL workspace
 * members, which leaked private-channel content to non-members). Returns the set
 * of notified userIds so the caller can dedup the broader thread/channel fan-out.
 */
async function notifyMentions(opts: {
    workspaceId: string
    profileId: string
    channelId: string
    messageId: string
    authorId: string
    authorName: string
    content: string
}): Promise<Set<string>> {
    const tokens = parseMentions(opts.content)
    if (tokens.length === 0) return new Set()

    // Candidates = channel members + workspace admins (admins can view any channel).
    const [channelMembers, wsAdmins] = await Promise.all([
        prisma.channelMember.findMany({
            where: { channelId: opts.channelId },
            select: { user: { select: { id: true, username: true } } },
        }),
        prisma.workspaceMember.findMany({
            where: { workspaceId: opts.workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
            select: { user: { select: { id: true, username: true } } },
        }),
    ])
    const byUsername = new Map<string, string>()
    for (const m of channelMembers) if (m.user) byUsername.set(m.user.username.toLowerCase(), m.user.id)
    for (const a of wsAdmins) if (a.user) byUsername.set(a.user.username.toLowerCase(), a.user.id)

    const matched = new Set<string>()
    for (const tok of tokens) {
        const uid = byUsername.get(tok)
        if (uid && uid !== opts.authorId) matched.add(uid)
    }
    if (matched.size === 0) return new Set()

    const ids = Array.from(matched)
    await prisma.mention
        .createMany({
            data: ids.map((userId) => ({ workspaceId: opts.workspaceId, profileId: opts.profileId, messageId: opts.messageId, userId })),
            skipDuplicates: true,
        })
        .catch(() => {})

    await createAndBroadcastNotifications(ids, {
        type: 'MENTION',
        title: `${opts.authorName} đã nhắc đến bạn`,
        body: opts.content.replace(/\s+/g, ' ').trim().slice(0, 140),
        actorId: opts.authorId,
        metadata: { channelId: opts.channelId, messageId: opts.messageId },
    })

    return matched
}

/** Paginated channel history (top-level messages), oldest→newest for display. */
export async function getMessages(
    workspaceId: string,
    channelId: string,
    opts?: { cursor?: string; limit?: number },
): Promise<{ messages: MessageDTO[]; nextCursor: string | null }> {
    await authorizeChannel(workspaceId, channelId, 'VIEW')

    const limit = Math.min(Math.max(opts?.limit ?? 30, 1), 50)
    const rows = await prisma.message.findMany({
        where: { workspaceId, channelId, parentId: null },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        include: MESSAGE_INCLUDE,
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? page[page.length - 1].id : null
    return { messages: page.reverse().map(serialize), nextCursor }
}

export async function sendMessage(
    workspaceId: string,
    channelId: string,
    content: string,
    parentId?: string | null,
    attachments?: Array<{ url: string; fileName: string; mimeType: string; sizeBytes: number; width?: number | null; height?: number | null }>,
): Promise<{ success: true; message: MessageDTO } | { error: string }> {
    let ctx: ChannelAuthzContext
    try {
        ctx = await authorizeChannel(workspaceId, channelId, 'POST')
    } catch {
        return { error: 'Bạn không có quyền gửi tin trong kênh này' }
    }

    const clean = content.trim()
    // [Phase 2] only trust attachments uploaded to THIS workspace's chat blob path
    // (blocks forged Attachment rows pointing at arbitrary URLs).
    const okAttachments = (attachments ?? [])
        .filter((a) => typeof a?.url === 'string' && a.url.includes(`/chat/${workspaceId}/`))
        .slice(0, 10)
    if (!clean && okAttachments.length === 0) return { error: 'Tin nhắn trống' }
    if (clean.length > 4000) return { error: 'Tin nhắn quá dài (tối đa 4000 ký tự)' }

    const profileId = await resolveProfileId(ctx, workspaceId)

    const created = await prisma.message.create({
        data: {
            workspaceId,
            profileId,
            channelId,
            authorId: ctx.userId,
            content: clean,
            parentId: parentId ?? null,
            ...(okAttachments.length
                ? {
                      attachments: {
                          create: okAttachments.map((a) => ({
                              workspaceId,
                              profileId,
                              url: a.url,
                              fileName: a.fileName.slice(0, 200),
                              mimeType: a.mimeType,
                              sizeBytes: a.sizeBytes,
                              width: a.width ?? null,
                              height: a.height ?? null,
                          })),
                      },
                  }
                : {}),
        },
        include: MESSAGE_INCLUDE,
    })

    if (parentId) {
        await prisma.message.updateMany({ where: { id: parentId, workspaceId }, data: { replyCount: { increment: 1 } } })
    }

    const dto = serialize(created)
    await broadcastToChannel(channelId, CHAT_EVENTS.MESSAGE_NEW, dto)

    // [nối dây] Fan-out notifications (best-effort — never blocks/fails the send).
    // Dedup precedence: mention > thread-reply > channel (one notif per user, most
    // specific type wins).
    try {
        const authorName = created.author?.displayName || created.author?.username || 'Ai đó'
        const preview = clean.replace(/\s+/g, ' ').trim().slice(0, 140)

        // 1. @mentions (most specific) — returns who was notified.
        const mentioned = await notifyMentions({ workspaceId, profileId, channelId, messageId: created.id, authorId: ctx.userId, authorName, content: clean })
        const exclude = new Set<string>([ctx.userId, ...mentioned])

        // 2. Thread reply → parent author + prior repliers.
        if (parentId) {
            const [parent, siblings] = await Promise.all([
                prisma.message.findUnique({ where: { id: parentId }, select: { authorId: true } }),
                prisma.message.findMany({ where: { parentId, workspaceId }, distinct: ['authorId'], select: { authorId: true } }),
            ])
            const threadIds = new Set<string>()
            if (parent?.authorId) threadIds.add(parent.authorId)
            for (const s of siblings) threadIds.add(s.authorId)
            const threadTargets = Array.from(threadIds).filter((id) => !exclude.has(id))
            if (threadTargets.length) {
                await createAndBroadcastNotifications(threadTargets, {
                    type: 'THREAD_REPLY',
                    title: `${authorName} đã trả lời trong thread`,
                    body: preview,
                    actorId: ctx.userId,
                    metadata: { channelId, messageId: created.id, parentId },
                })
                threadTargets.forEach((id) => exclude.add(id))
            }
        }

        // 3. Channel members (broadest) — skip muted + already-notified + author.
        const [members, ch] = await Promise.all([
            prisma.channelMember.findMany({ where: { channelId }, select: { userId: true, muted: true } }),
            prisma.channel.findUnique({ where: { id: channelId }, select: { name: true } }),
        ])
        const channelTargets = members.filter((m) => !m.muted && !exclude.has(m.userId)).map((m) => m.userId)
        if (channelTargets.length) {
            await createAndBroadcastNotifications(channelTargets, {
                type: 'CHANNEL_MESSAGE',
                title: ch?.name ? `Tin mới trong #${ch.name}` : 'Tin nhắn mới',
                body: `${authorName}: ${preview}`,
                actorId: ctx.userId,
                metadata: { channelId, messageId: created.id },
            })
        }
    } catch {
        /* ignore — notifications must never break the send */
    }

    return { success: true, message: dto }
}

export async function editMessage(
    workspaceId: string,
    messageId: string,
    content: string,
): Promise<{ success: true; message: MessageDTO } | { error: string }> {
    const clean = content.trim()
    if (!clean) return { error: 'Tin nhắn trống' }

    const existing = await prisma.message.findFirst({
        where: { id: messageId, workspaceId },
        select: { id: true, channelId: true, authorId: true, deletedAt: true },
    })
    if (!existing || existing.deletedAt) return { error: 'Không tìm thấy tin nhắn' }

    let ctx: ChannelAuthzContext
    try {
        ctx = await authorizeChannel(workspaceId, existing.channelId, 'VIEW')
    } catch {
        return { error: 'Không có quyền' }
    }
    const canEdit = existing.authorId === ctx.userId || ctx.isWorkspaceAdmin || ctx.channelMemberRole === 'MODERATOR'
    if (!canEdit) return { error: 'Không có quyền sửa tin nhắn này' }

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content: clean.slice(0, 4000), editedAt: new Date() },
        include: MESSAGE_INCLUDE,
    })
    const dto = serialize(updated)
    await broadcastToChannel(existing.channelId, CHAT_EVENTS.MESSAGE_EDIT, dto)
    return { success: true, message: dto }
}

export async function deleteMessage(
    workspaceId: string,
    messageId: string,
): Promise<{ success: true } | { error: string }> {
    const existing = await prisma.message.findFirst({
        where: { id: messageId, workspaceId },
        select: { id: true, channelId: true, authorId: true, deletedAt: true },
    })
    if (!existing) return { error: 'Không tìm thấy tin nhắn' }
    if (existing.deletedAt) return { success: true }

    let ctx: ChannelAuthzContext
    try {
        ctx = await authorizeChannel(workspaceId, existing.channelId, 'VIEW')
    } catch {
        return { error: 'Không có quyền' }
    }
    const canDelete = existing.authorId === ctx.userId || ctx.isWorkspaceAdmin || ctx.channelMemberRole === 'MODERATOR'
    if (!canDelete) return { error: 'Không có quyền xoá tin nhắn này' }

    await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } })
    await broadcastToChannel(existing.channelId, CHAT_EVENTS.MESSAGE_DELETE, { id: messageId })
    revalidatePath(`/${workspaceId}/admin/hub`)
    return { success: true }
}
