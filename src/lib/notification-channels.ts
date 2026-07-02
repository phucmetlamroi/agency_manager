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

// [Chat GĐ3 · E1] Per-task comment feed channel. Every staff drawer viewing a
// task subscribes to `task:{taskId}`; the server fires a lightweight event on
// create / edit / delete / react / assign / resolve so open feeds refetch. The
// payload is intentionally minimal ({ commentId }) — the client re-fetches the
// authoritative feed (respecting role visibility) rather than trusting a pushed
// row, so no INTERNAL content ever rides the broadcast.
export const TASK_COMMENT_EVENTS = {
    FEED_CHANGED: 'task_comment_changed',
} as const

export function getTaskCommentChannel(taskId: string) {
    return `task:${taskId}`
}
