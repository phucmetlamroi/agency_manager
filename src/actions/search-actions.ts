'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { visibleChannelWhere, getUserRoleIds } from '@/lib/channel-permissions'

export interface SearchHitDTO {
    id: string
    channelId: string
    channelName: string
    content: string
    authorId: string
    authorName: string
    createdAt: string
}

/**
 * [Chat] Message search scoped to channels the caller may VIEW. Postgres ILIKE
 * (`contains`, insensitive) — fine at current scale; **reuses `visibleChannelWhere`**
 * so a hit can never leak from a channel the user isn't a member of (security linchpin).
 */
export async function searchMessages(workspaceId: string, query: string): Promise<SearchHitDTO[]> {
    const q = query.trim()
    if (q.length < 2) return []

    let userId: string
    try {
        const r = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        userId = r.userId
    } catch {
        return []
    }

    // Only Hub channels the caller may VIEW (member-of or role/user overwrite). TASK chats
    // are excluded — task discussions aren't part of workspace-wide search.
    const userRoleIds = await getUserRoleIds(workspaceId, userId)
    const channels = await prisma.channel.findMany({
        where: { workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] }, ...visibleChannelWhere(userId, userRoleIds) },
        select: { id: true, name: true },
    })
    if (channels.length === 0) return []
    const nameById = new Map(channels.map((c) => [c.id, c.name]))

    const rows = await prisma.message.findMany({
        where: {
            workspaceId,
            channelId: { in: channels.map((c) => c.id) },
            deletedAt: null,
            content: { contains: q, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
            id: true,
            channelId: true,
            content: true,
            authorId: true,
            createdAt: true,
            author: { select: { username: true, displayName: true } },
        },
    })

    return rows.map((m) => ({
        id: m.id,
        channelId: m.channelId,
        channelName: nameById.get(m.channelId) ?? '',
        content: m.content,
        authorId: m.authorId,
        authorName: m.author?.displayName || m.author?.username || 'Người dùng',
        createdAt: new Date(m.createdAt).toISOString(),
    }))
}
