import type { NotificationType } from '@prisma/client'

export interface CreateNotificationParams {
    userId: string
    type: NotificationType
    title: string
    body: string
    avatarUrl?: string | null
    conversationId?: string | null
    messageId?: string | null
    taskId?: string | null
    actorId?: string | null
    metadata?: Record<string, any>
}

export interface NotificationItem {
    id: string
    type: NotificationType
    title: string
    body: string
    avatarUrl: string | null
    isRead: boolean
    conversationId: string | null
    messageId: string | null
    taskId: string | null
    actorId: string | null
    metadata: Record<string, any> | null
    createdAt: string
}
