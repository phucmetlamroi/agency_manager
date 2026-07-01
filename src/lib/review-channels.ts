// [Video Review] Client-safe realtime channel + event names. Pure constants
// (no env / no server code) so both the server broadcaster (review-realtime.ts)
// and client subscribers (the review overlay) import from here.

export const REVIEW_EVENTS = {
    COMMENT_NEW: 'review_comment_new',
    COMMENT_UPDATED: 'review_comment_updated',
    STATUS_CHANGED: 'review_status_changed',
    VERSION_NEW: 'review_version_new',
} as const

export type ReviewEvent = (typeof REVIEW_EVENTS)[keyof typeof REVIEW_EVENTS]

/** Per-version channel — reviewers of a version subscribe to exactly this. */
export function getReviewVersionChannel(versionId: string) {
    return `review:${versionId}`
}

/** Per-deliverable channel — "a new version landed" toasts. */
export function getReviewTaskChannel(taskId: string) {
    return `review-task:${taskId}`
}
