// [Review module P3.3] The ONE config that maps a review "meaning" → an app task-status
// value (FR-D02). Changing a value here changes the sync behavior with NO code change
// elsewhere (AC2). Values must be members of VALID_TASK_STATUSES (src/lib/task-statuses).
// Client-importable (pure constants, no server deps) so the drawer banner can read it.

import type { TaskStatus } from '@/lib/task-statuses'

export const REVIEW_STATUS_MAP = {
    /** Asset status meaning "approved / done" → propose flipping the task to this. */
    approved: 'Hoàn tất' as TaskStatus,
    /** Admin internal reject → task goes to 'Revision' (legacy "Sửa lại" tab). UNCHANGED. */
    changesRequested: 'Revision' as TaskStatus,
    /** [P3/F2 §3.6] Guest "Request changes" on /r/ → the CLIENT-side status A6. A SEPARATE
     *  key from `changesRequested` on purpose: retargeting that one in place would orphan
     *  'Revision' and pull guest-rejected tasks out of the "Sửa lại" tab (K6). */
    clientChangesRequested: 'Đã nhận feedback (khách)' as TaskStatus,
    // ── [P3-B / F7–F10] auto-transition targets on the video lifecycle axis. Kept HERE
    //    (config-driven, FR-D02 AC2) so the sync services read a meaning, not a literal. ──
    /** F7 — Mux READY: editor's cut is submitted for internal review (A2). */
    submitted: 'Đã nộp video (nội bộ)' as TaskStatus,
    /** F8 — admin closed the feedback session, editor must fix (A3). */
    internalFeedbackOpen: 'Đang sửa feedback (nội bộ)' as TaskStatus,
    /** F9 (internal round) — editor confirmed the internal fix (A4). */
    internalFixDone: 'Đã sửa feedback (nội bộ)' as TaskStatus,
    /** F10 — admin approved & sent to the client (A5). */
    sentToClient: 'Đã gửi video (khách)' as TaskStatus,
    /** F9 (client round) — editor confirmed the client fix (A7). */
    clientFixDone: 'Đã sửa feedback (khách)' as TaskStatus,
} as const

/** True when an asset's card status is the value the map treats as "approved" (FR-D02). */
export function isApprovedTaskStatus(statusId: string | null | undefined): boolean {
    return !!statusId && statusId === REVIEW_STATUS_MAP.approved
}
