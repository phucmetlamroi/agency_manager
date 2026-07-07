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
} as const

/** True when an asset's card status is the value the map treats as "approved" (FR-D02). */
export function isApprovedTaskStatus(statusId: string | null | undefined): boolean {
    return !!statusId && statusId === REVIEW_STATUS_MAP.approved
}
