// Realtime notification channel helpers.
//
// Powers in-app notifications (task assigned / status changed / deadline /
// overdue / workspace invitations): `NotificationBell` subscribes to the user's
// private channel and the server broadcasts `NOTIFICATION_NEW` to it.

export const NOTIFICATION_EVENTS = {
    NOTIFICATION_NEW: 'notification_new',
    NOTIFICATION_READ: 'notification_read',
} as const

export function getUserNotificationChannel(userId: string) {
    return `user:${userId}`
}
