// [Review module P3.3] Manual task sync (FR-D02 / FR-A05 semi-auto approve). When a
// member has set a task's review asset to the approved-mapped status, the task drawer
// shows a banner; confirming here flips the TASK status to the mapped value.
//
// The actual task mutation is DELEGATED to the app's updateTaskStatus service, which
// owns the RBAC (workspace-admin OR the task's assignee), the status FSM, and optimistic
// locking — we do not re-implement any of that (and thus can't drift from it). This layer
// only adds the review-side guard (an approved asset must exist) + the audit activity.
// No finance fields are read from the task.

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { apiError } from './errors'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { REVIEW_STATUS_MAP } from './status-map'
import { updateTaskStatus } from '@/actions/task-actions'
import { reviewLog } from './logger'
import { isValidStatus } from '@/lib/task-statuses'
import { STATUS_REQUIRES_NULL_DEADLINE } from '@/lib/task-invariants'

export async function confirmTaskHoanTat(taskId: string): Promise<{ ok: true; taskId: string; status: string }> {
    // Guard: at least one LIVE review asset for this task must be at the approved status.
    const asset = await prisma.reviewAsset.findFirst({
        where: { taskId, deletedAt: null, statusId: REVIEW_STATUS_MAP.approved },
        select: { id: true, workspaceId: true },
    })
    if (!asset) {
        throw apiError(409, 'STATE_INVALID', 'Chưa có bản dựng nào ở trạng thái duyệt cho task này.', { reason: 'not_approved' })
    }
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })

    // Delegate the task write. updateTaskStatus re-checks admin/assignee + the FSM and
    // returns { error } (user-facing VN) on any refusal — surface it verbatim.
    const res = await updateTaskStatus(taskId, REVIEW_STATUS_MAP.approved, asset.workspaceId)
    if (res && typeof res === 'object' && 'error' in res && res.error) {
        const msg = String(res.error)
        const forbidden = /forbidden|quyền/i.test(msg)
        throw apiError(forbidden ? 403 : 409, forbidden ? 'FORBIDDEN' : 'STATE_INVALID', msg)
    }

    await prisma.$transaction(async (tx) => {
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.TASK_COMPLETED_FROM_ASSET,
            workspaceId: asset.workspaceId,
            taskId,
            assetId: asset.id,
            actorUserId: access.userId,
            meta: { status: REVIEW_STATUS_MAP.approved },
        })
    })
    return { ok: true, taskId, status: REVIEW_STATUS_MAP.approved }
}

/**
 * [P5.4] Guest "Request changes" → task AUTO-flips to the mapped status
 * (FR-A05 AC1 — "Sửa lại", mapped to this repo's real "Revision" value).
 *
 * updateTaskStatus CANNOT be delegated to here: it requires a logged-in session
 * (getCurrentUser) and a guest has none — this runs inside an Inngest function.
 * So this is a direct scoped write that replicates exactly what that service
 * does for a plain status change to "Revision": status + deadline-null
 * invariant (STATUS_REQUIRES_NULL_DEADLINE) + optimistic `version` increment.
 * No assignee reset, no archive — those only apply to other target statuses.
 * Spec explicitly includes pulling a task BACK from "Hoàn tất" (API-SPEC §6.4).
 */
export async function syncTaskOnChangesRequested(
    taskId: string,
    workspaceId: string,
): Promise<{ applied: boolean; from?: string }> {
    const target = REVIEW_STATUS_MAP.changesRequested
    if (!isValidStatus(target)) {
        // Mapping points at a status this app no longer has — record-only fallback (FR-D02).
        reviewLog('error', 'task_sync.bad_status_map', { taskId, target })
        return { applied: false }
    }
    const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true, status: true },
    })
    if (!task) {
        reviewLog('warn', 'task_sync.task_missing', { taskId, workspaceId })
        return { applied: false }
    }
    if (task.status === target) return { applied: false, from: task.status } // already there

    const res = await prisma.task.updateMany({
        where: { id: taskId, workspaceId, status: task.status }, // lose races cleanly
        data: {
            status: target,
            version: { increment: 1 },
            ...(STATUS_REQUIRES_NULL_DEADLINE.includes(target as (typeof STATUS_REQUIRES_NULL_DEADLINE)[number])
                ? { deadline: null }
                : {}),
        },
    })
    if (res.count === 0) {
        reviewLog('warn', 'task_sync.race_lost', { taskId, from: task.status })
        return { applied: false, from: task.status }
    }
    reviewLog('info', 'task_sync.changes_requested', { taskId, from: task.status, to: target })
    return { applied: true, from: task.status }
}
