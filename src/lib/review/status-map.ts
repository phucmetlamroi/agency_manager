// [Review module P3.3] The ONE config that maps a review "meaning" → an app task-status
// value (FR-D02). Changing a value here changes the sync behavior with NO code change
// elsewhere (AC2). Values must be members of VALID_TASK_STATUSES (src/lib/task-statuses).
// Client-importable (pure constants, no server deps) so the drawer banner can read it.

import type { TaskStatus } from '@/lib/task-statuses'

export const REVIEW_STATUS_MAP = {
    /** Asset status meaning "approved / done" → propose flipping the task to this. */
    approved: 'Hoàn tất' as TaskStatus,
    /** Guest "Request changes" (P5) → task auto-goes here. Kept here so the map is one place. */
    changesRequested: 'Revision' as TaskStatus,
} as const

/** True when an asset's card status is the value the map treats as "approved" (FR-D02). */
export function isApprovedTaskStatus(statusId: string | null | undefined): boolean {
    return !!statusId && statusId === REVIEW_STATUS_MAP.approved
}
