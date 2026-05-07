/**
 * Template parameter interfaces for HustlyTasker notification emails.
 * Each NotificationType maps to a template function that accepts one of these params.
 */

export interface BaseParams {
    recipientName: string
    recipientUserId: string
    appUrl: string
    workspaceId?: string | null
}

export interface MessageDMParams extends BaseParams {
    senderName: string
    senderAvatarUrl?: string | null
    messagePreview: string
    messageTime: Date
    conversationId: string
    msgType?: string | null
}

export interface MessageGroupParams extends MessageDMParams {
    groupName: string
    groupAvatarUrl?: string | null
}

export interface MentionParams extends BaseParams {
    senderName: string
    senderAvatarUrl?: string | null
    conversationName: string
    conversationType: 'DIRECT' | 'GROUP'
    messagePreview: string
    messageTime: Date
    conversationId: string
}

export interface GroupAddedParams extends BaseParams {
    groupName: string
    groupAvatarUrl?: string | null
    adderName: string
    memberCount: number
    memberNames: string[]
    createdAt: Date
    conversationId: string
}

export interface GroupRemovedParams extends BaseParams {
    groupName: string
    removerName: string
}

export interface GroupLeftParams extends BaseParams {
    groupName: string
    leaverName: string
    leaverAvatarUrl?: string | null
    leftAt: Date
    remainingMemberCount: number
    conversationId: string
}

export interface GroupDeletedParams extends BaseParams {
    groupName: string
    creatorName: string
}

export interface TaskAssignedParams extends BaseParams {
    taskTitle: string
    assignerName: string
    projectName?: string | null
    status: string
    priority?: string | null
    deadline?: Date | null
    description?: string | null
    taskId: string
    conversationId?: string | null
}

export interface TaskUnassignedParams extends BaseParams {
    taskTitle: string
    unassignerName: string
}

export interface TaskStatusChangedParams extends BaseParams {
    taskTitle: string
    actorName: string
    actorAvatarUrl?: string | null
    oldStatus: string
    newStatus: string
    deadline?: Date | null
    changedAt: Date
    taskId: string
}

export interface TaskDeadlineParams extends BaseParams {
    taskTitle: string
    status: string
    deadline: Date
    assignerName?: string | null
    taskId: string
    conversationId?: string | null
}

export interface TaskOverdueParams extends BaseParams {
    taskTitle: string
    status: string
    deadline: Date
    assigneeName: string
    overdueDuration: string
    taskId: string
    isManagerView?: boolean
}

export interface TaskCommentParams extends BaseParams {
    taskTitle: string
    commenterName: string
    commenterAvatarUrl?: string | null
    commentPreview: string
    commentTime: Date
    taskId: string
}

export interface DigestNotificationItem {
    type: string
    title: string
    body: string
    metadata?: Record<string, any> | null
    createdAt: Date
}

export interface DigestParams extends BaseParams {
    timeRange: string
    chatNotifications: DigestNotificationItem[]
    taskNotifications: DigestNotificationItem[]
    groupNotifications: DigestNotificationItem[]
    chatCount: number
    taskCount: number
    groupCount: number
    totalCount: number
    overview?: {
        completedTasksCount: number
        pendingTasksCount: number
        overdueTasksCount: number
        unreadMessagesCount: number
    }
}

export interface RenderedEmail {
    subject: string
    html: string
}
