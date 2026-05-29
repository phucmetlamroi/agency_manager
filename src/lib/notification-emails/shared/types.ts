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

export interface TaskAssignedParams extends BaseParams {
    taskTitle: string
    assignerName: string
    projectName?: string | null
    status: string
    priority?: string | null
    deadline?: Date | null
    description?: string | null
    taskId: string
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
    taskNotifications: DigestNotificationItem[]
    taskCount: number
    totalCount: number
    overview?: {
        completedTasksCount: number
        pendingTasksCount: number
        overdueTasksCount: number
    }
}

export interface RenderedEmail {
    subject: string
    html: string
}
