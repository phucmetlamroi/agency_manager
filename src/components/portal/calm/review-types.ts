// [Video Review] Client-safe DTO shapes shared by the token-gated review
// actions (src/actions/video-review-actions.ts) and the portal UI. Kept out of
// the 'use server' module so client components can import the types without
// pulling in server code.

export interface ReviewCommentDTO {
    id: string
    body: string
    timestampSec: number | null
    frame: number | null
    authorType: string
    authorName: string
    createdAt: string
}

export interface ReviewVersionDTO {
    id: string
    versionNumber: number
    label: string | null
    ready: boolean
    status: string
    durationSec: number | null
    fps: number | null
    /** Signed HLS manifest (null until Stream configured + video ready). */
    manifestUrl: string | null
    /** Signed iframe embed URL — driven by the Stream Player SDK. */
    iframeUrl: string | null
    thumbnailUrl: string | null
    createdAt: string
}

export interface ReviewSnapshot {
    taskId: string
    taskTitle: string
    clientName: string
    versions: ReviewVersionDTO[]
    currentVersionId: string | null
    comments: ReviewCommentDTO[]
    caps: { allowVideoComments: boolean; canApprove: boolean; allowDownload: boolean }
}

/* ── Staff-side review DTOs (session-gated; INCLUDES internal comments) ──────
 * Distinct from the client DTOs above: the staff snapshot carries both
 * INTERNAL and CLIENT comments, real author names, resolve state, and threaded
 * replies. NEVER served to the token portal. */

export interface StaffReviewCommentDTO {
    id: string
    body: string
    timestampSec: number | null
    frame: number | null
    authorType: string
    authorName: string
    /** 'INTERNAL' | 'CLIENT' */
    visibility: string
    completed: boolean
    completedAt: string | null
    parentId: string | null
    createdAt: string
    replies: StaffReviewCommentDTO[]
}

export interface StaffReviewVersionDTO {
    id: string
    versionNumber: number
    label: string | null
    ready: boolean
    status: string
    durationSec: number | null
    fps: number | null
    iframeUrl: string | null
    createdAt: string
}

export interface StaffReviewSnapshot {
    taskId: string
    taskTitle: string
    versions: StaffReviewVersionDTO[]
    currentVersionId: string | null
    comments: StaffReviewCommentDTO[]
}

/** Review methods added to the portal's DeliverableActions adapter. */
export interface ReviewActions {
    getReview?: (taskId: string) => Promise<ReviewSnapshot | null>
    getVersionComments?: (taskId: string, versionId: string) => Promise<ReviewCommentDTO[]>
    addReviewComment?: (
        taskId: string,
        versionId: string,
        input: { body: string; timestampSec?: number | null },
    ) => Promise<{ success: boolean; error?: string; comment?: ReviewCommentDTO }>
    approveReview?: (taskId: string, versionId: string) => Promise<{ success?: boolean; error?: string }>
    requestReviewChanges?: (taskId: string, versionId: string, feedback: string) => Promise<{ success?: boolean; error?: string }>
}
