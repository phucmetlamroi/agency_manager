'use server'

import { prisma } from '@/lib/db'
import { authorizeChannel, type ChannelAuthzContext } from '@/lib/channel-permissions'
import { broadcastToChannel } from '@/lib/notification-broadcast'
import { CHAT_EVENTS } from '@/lib/chat-channels'
import { checkChatWriteLimit } from '@/lib/chat-rate-limit'
import type { ReactionDTO } from './message-actions'

function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
    const map = new Map<string, string[]>()
    for (const r of rows) {
        if (!map.has(r.emoji)) map.set(r.emoji, [])
        map.get(r.emoji)!.push(r.userId)
    }
    return Array.from(map.entries()).map(([emoji, userIds]) => ({ emoji, userIds }))
}

/**
 * Toggle the caller's reaction (emoji) on a message, then rebroadcast that
 * message's full reaction set so all subscribers update. Requires VIEW on the
 * channel (server-side authorize).
 */
export async function toggleReaction(
    workspaceId: string,
    messageId: string,
    emoji: string,
): Promise<{ success: true; reactions: ReactionDTO[] } | { error: string }> {
    const msg = await prisma.message.findFirst({
        where: { id: messageId, workspaceId },
        select: { id: true, channelId: true },
    })
    if (!msg) return { error: 'Không tìm thấy tin nhắn' }

    let ctx: ChannelAuthzContext
    try {
        ctx = await authorizeChannel(workspaceId, msg.channelId, 'VIEW')
    } catch {
        return { error: 'Không có quyền' }
    }

    // [Security · Phase 6] Cap reaction storms (the playbook's reaction-storm scenario).
    const rl = await checkChatWriteLimit('reaction', ctx.userId)
    if (rl) return { error: rl }

    const e = emoji.slice(0, 8)
    const existing = await prisma.reaction.findUnique({
        where: { messageId_userId_emoji: { messageId, userId: ctx.userId, emoji: e } },
        select: { id: true },
    })

    if (existing) {
        await prisma.reaction.delete({ where: { id: existing.id } })
    } else {
        const profileId =
            ctx.profileId ?? (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } }))?.profileId
        if (!profileId) return { error: 'Workspace chưa gắn profile' }
        await prisma.reaction.create({ data: { workspaceId, profileId, messageId, userId: ctx.userId, emoji: e } }).catch(() => {})
    }

    const rows = await prisma.reaction.findMany({ where: { messageId }, select: { emoji: true, userId: true } })
    const reactions = groupReactions(rows)
    await broadcastToChannel(msg.channelId, CHAT_EVENTS.REACTION, { messageId, reactions })
    return { success: true, reactions }
}
