// [Review module P3.2] Asset status = a HustlyTasker task-status string, read DYNAMICALLY
// from the app's single source of truth (src/lib/task-statuses.ts). The review module
// NEVER hardcodes its own status set (FR-D01): add a status to the app → it appears here.
// setAssetStatus writes an audit row to ReviewActivity (there is NO ReviewStatusHistory
// model — DATA-MODEL §4.10). Colors are applied client-side (view-prefs.statusColor) so
// the chip matches the app; this layer only owns value/label + validation.

import { prisma } from '@/lib/db'
import { requireReviewAccess } from './access'
import { apiError } from './errors'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
import { VALID_TASK_STATUSES, isValidStatus } from '@/lib/task-statuses'

export interface ReviewStatusOption {
    value: string
    label: string
}

/** The dropdown's options — the app's task-status list, verbatim + in order (FR-D01 AC1). */
export async function getReviewStatusOptions(): Promise<{ options: ReviewStatusOption[] }> {
    await requireReviewAccess() // logged-in internal member (blocks LOCKED/CLIENT/guest)
    return { options: VALID_TASK_STATUSES.map((s) => ({ value: s, label: s })) }
}

/**
 * Set (or clear) the card status of an asset. `statusId = null` = "Bỏ trạng thái".
 * Optimistic-locked via rowVersion; writes a ReviewActivity STATUS_CHANGED row with
 * {old,new} so the change is auditable + drives the FR-D02 task-sync banner.
 */
export async function setAssetStatus(
    assetId: string,
    input: { statusId: string | null; expectedRowVersion?: number },
): Promise<{ id: string; statusKey: string | null; rowVersion: number }> {
    const statusId = input.statusId
    if (statusId !== null && !isValidStatus(statusId)) {
        throw apiError(400, 'VALIDATION_ERROR', 'Trạng thái không hợp lệ.', { reason: 'unknown_status' })
    }
    const asset = await prisma.reviewAsset.findFirst({ where: { id: assetId, deletedAt: null } })
    if (!asset) throw apiError(404, 'NOT_FOUND', 'Không tìm thấy asset.')
    const access = await requireReviewAccess({ workspaceId: asset.workspaceId })

    if (input.expectedRowVersion !== undefined && asset.rowVersion !== input.expectedRowVersion) {
        throw apiError(409, 'ROW_VERSION_MISMATCH', 'Asset đã bị thay đổi. Tải lại rồi thử lại.', {
            current: { id: asset.id, statusKey: asset.statusId, rowVersion: asset.rowVersion },
        })
    }
    if (asset.statusId === statusId) {
        return { id: asset.id, statusKey: asset.statusId, rowVersion: asset.rowVersion } // no-op, no activity
    }

    const updated = await prisma.$transaction(async (tx) => {
        const u = await tx.reviewAsset.update({
            where: { id: assetId },
            data: { statusId, rowVersion: { increment: 1 } },
            select: { id: true, statusId: true, rowVersion: true },
        })
        await recordActivity(tx, {
            type: REVIEW_ACTIVITY.STATUS_CHANGED,
            workspaceId: asset.workspaceId,
            taskId: asset.taskId,
            assetId: asset.id,
            actorUserId: access.userId,
            meta: { old: asset.statusId, new: statusId },
        })
        return u
    })
    return { id: updated.id, statusKey: updated.statusId, rowVersion: updated.rowVersion }
}
