'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import type { NotificationType } from '@prisma/client'
import type { CreateNotificationParams } from '@/types/notification'

async function getAuthUserId(): Promise<string | null> {
    const session = await getSession()
    return session?.user?.id || null
}

const GROUPING_WINDOW_MS = 5 * 60 * 1000  // 5 minutes

/**
 * Create a single notification.
 * Implements grouping: if the same recipient already has an unread NEW_MESSAGE
 * for the same conversation within the last 5 minutes, mutate that record
 * instead of inserting a new one (avoids spamming the panel).
 *
 * Always returns a notification record. Does NOT throw if the recipient is the
 * actor (callers must filter that out themselves).
 */
export async function createNotificationInternal(params: CreateNotificationParams) {
    const {
        userId, type, title, body,
        avatarUrl, conversationId, messageId, taskId, actorId, metadata,
    } = params

    // Grouping path — only for NEW_MESSAGE within same conversation
    if (type === 'NEW_MESSAGE' && conversationId) {
        const existing = await prisma.notification.findFirst({
            where: {
                userId,
                type: 'NEW_MESSAGE',
                conversationId,
                isRead: false,
                isArchived: false,
                createdAt: { gte: new Date(Date.now() - GROUPING_WINDOW_MS) },
            },
            orderBy: { createdAt: 'desc' },
        })
        if (existing) {
            const existingMeta = (existing.metadata as Record<string, any> | null) || {}
            const messageCount = ((existingMeta.messageCount as number) || 1) + 1
            const updated = await prisma.notification.update({
                where: { id: existing.id },
                data: {
                    title,
                    body,  // overwrite with the latest message body so panel always shows latest
                    avatarUrl: avatarUrl || existing.avatarUrl,
                    messageId: messageId || existing.messageId,
                    actorId: actorId || existing.actorId,
                    metadata: { ...existingMeta, ...(metadata || {}), messageCount },
                    createdAt: new Date(),  // bump so it stays at top of panel
                },
            })
            return updated
        }
    }

    const created = await prisma.notification.create({
        data: {
            userId,
            type,
            title,
            body,
            avatarUrl: avatarUrl || null,
            conversationId: conversationId || null,
            messageId: messageId || null,
            taskId: taskId || null,
            actorId: actorId || null,
            metadata: (metadata as any) || undefined,
        },
    })
    return created
}

export async function createBulkNotificationsInternal(
    userIds: string[],
    params: Omit<CreateNotificationParams, 'userId'>
) {
    const ids = Array.from(new Set(userIds))
    const results = await Promise.all(
        ids.map(uid => createNotificationInternal({ ...params, userId: uid }))
    )
    return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-facing actions
// ─────────────────────────────────────────────────────────────────────────────

export async function getNotifications(params?: {
    cursor?: string
    limit?: number
    unreadOnly?: boolean
    type?: NotificationType
}) {
    const userId = await getAuthUserId()
    if (!userId) return { error: 'Unauthorized' }

    const limit = Math.min(params?.limit ?? 20, 100)

    const where: any = {
        userId,
        isArchived: false,
    }
    if (params?.unreadOnly) where.isRead = false
    if (params?.type) where.type = params.type

    const items = await prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1,  // peek for hasMore
        ...(params?.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    })

    const hasMore = items.length > limit
    const sliced = hasMore ? items.slice(0, limit) : items
    const nextCursor = hasMore ? sliced[sliced.length - 1].id : null

    const unreadCount = await prisma.notification.count({
        where: { userId, isRead: false, isArchived: false },
    })

    return {
        data: {
            notifications: sliced.map(n => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                avatarUrl: n.avatarUrl,
                isRead: n.isRead,
                conversationId: n.conversationId,
                messageId: n.messageId,
                taskId: n.taskId,
                actorId: n.actorId,
                metadata: n.metadata as Record<string, any> | null,
                createdAt: n.createdAt.toISOString(),
            })),
            nextCursor,
            unreadCount,
        },
    }
}

export async function getUnreadNotificationCount() {
    const userId = await getAuthUserId()
    if (!userId) return { data: { count: 0 } }

    const count = await prisma.notification.count({
        where: { userId, isRead: false, isArchived: false },
    })

    return { data: { count } }
}

export async function markNotificationRead(notificationId: string) {
    const userId = await getAuthUserId()
    if (!userId) return { error: 'Unauthorized' }

    const notif = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { userId: true, isRead: true },
    })
    if (!notif) return { error: 'Notification not found' }
    if (notif.userId !== userId) return { error: 'Forbidden' }

    if (!notif.isRead) {
        await prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true },
        })
    }

    return { data: { ok: true } }
}

export async function markAllNotificationsRead() {
    const userId = await getAuthUserId()
    if (!userId) return { error: 'Unauthorized' }

    const res = await prisma.notification.updateMany({
        where: { userId, isRead: false, isArchived: false },
        data: { isRead: true },
    })

    return { data: { count: res.count } }
}

export async function archiveNotification(notificationId: string) {
    const userId = await getAuthUserId()
    if (!userId) return { error: 'Unauthorized' }

    const notif = await prisma.notification.findUnique({
        where: { id: notificationId },
        select: { userId: true },
    })
    if (!notif) return { error: 'Notification not found' }
    if (notif.userId !== userId) return { error: 'Forbidden' }

    await prisma.notification.update({
        where: { id: notificationId },
        data: { isArchived: true, isRead: true },
    })

    return { data: { ok: true } }
}

export async function clearAllArchived() {
    const userId = await getAuthUserId()
    if (!userId) return { error: 'Unauthorized' }

    const res = await prisma.notification.deleteMany({
        where: { userId, isArchived: true },
    })

    return { data: { count: res.count } }
}
