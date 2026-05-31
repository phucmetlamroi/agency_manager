'use server'

import { prisma } from '@/lib/db'
import { authorizeChannel, type ChannelAuthzContext } from '@/lib/channel-permissions'
import { broadcastToChannel } from '@/lib/notification-broadcast'
import { CHAT_EVENTS } from '@/lib/chat-channels'
import { revalidatePath } from 'next/cache'

/**
 * Knowledge Hub — message read/write (server actions). Every call goes through
 * authorizeChannel() (default-deny, server-side). Persist-only here; realtime
 * broadcast is layered on in Phase 2.
 */

const AUTHOR_SELECT = { id: true, username: true, displayName: true, avatarUrl: true } as const

export interface MessageAuthorDTO {
    id: string
    username: string
    displayName: string | null
    avatarUrl: string | null
}
export interface MessageDTO {
    id: string
    channelId: string
    content: string
    authorId: string
    author: MessageAuthorDTO | null
    parentId: string | null
    replyCount: number
    editedAt: string | null
    deletedAt: string | null
    createdAt: string
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
        editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null,
        deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null,
        createdAt: new Date(m.createdAt).toISOString(),
    }
}

/** Resolve the profileId for create injection (session → workspace fallback). */
async function resolveProfileId(ctx: ChannelAuthzContext, workspaceId: string): Promise<string> {
    if (ctx.profileId) return ctx.profileId
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    if (!ws?.profileId) throw new Error('SECURITY_VIOLATION: workspace has no profile')
    return ws.profileId
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
        include: { author: { select: AUTHOR_SELECT } },
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const nextCursor = hasMore ? page[page.length - 1].id : null
    // rows are newest-first → reverse for chronological render.
    return { messages: page.reverse().map(serialize), nextCursor }
}

export async function sendMessage(
    workspaceId: string,
    channelId: string,
    content: string,
    parentId?: string | null,
): Promise<{ success: true; message: MessageDTO } | { error: string }> {
    let ctx: ChannelAuthzContext
    try {
        ctx = await authorizeChannel(workspaceId, channelId, 'POST')
    } catch {
        return { error: 'Bạn không có quyền gửi tin trong kênh này' }
    }

    const clean = content.trim()
    if (!clean) return { error: 'Tin nhắn trống' }
    if (clean.length > 4000) return { error: 'Tin nhắn quá dài (tối đa 4000 ký tự)' }

    const profileId = await resolveProfileId(ctx, workspaceId)

    const created = await prisma.message.create({
        data: { workspaceId, profileId, channelId, authorId: ctx.userId, content: clean, parentId: parentId ?? null },
        include: { author: { select: AUTHOR_SELECT } },
    })

    // Maintain denormalized replyCount on the parent (scoped to workspace).
    if (parentId) {
        await prisma.message.updateMany({
            where: { id: parentId, workspaceId },
            data: { replyCount: { increment: 1 } },
        })
    }

    const dto = serialize(created)
    await broadcastToChannel(channelId, CHAT_EVENTS.MESSAGE_NEW, dto)
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
    // Author can edit own message; channel/workspace managers can edit any.
    const canEdit = existing.authorId === ctx.userId || ctx.isWorkspaceAdmin || ctx.channelMemberRole === 'MODERATOR'
    if (!canEdit) return { error: 'Không có quyền sửa tin nhắn này' }

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content: clean.slice(0, 4000), editedAt: new Date() },
        include: { author: { select: AUTHOR_SELECT } },
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
