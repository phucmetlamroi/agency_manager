/**
 * [Z+1.fix8] Task assigneeId ↔ status invariant enforcement.
 *
 * Invariant:
 *   - assigneeId === null  ↔  status === "Đang đợi giao"  (unassigned, in queue)
 *   - assigneeId !== null  ↔  status !== "Đang đợi giao"  (assigned)
 *
 * Reusable helper — import vào bất kỳ code path nào mutate task.
 * Safe code paths (assignTask, createTask, returnTask, claimTask) đã enforce
 * invariant manually → không cần gọi helper này.
 */

const QUEUE_STATUS = 'Đang đợi giao'
const DEFAULT_ASSIGNED_STATUS = 'Nhận task'

interface InvariantResult {
    /** True nếu helper đã auto-sync field để giữ invariant */
    synced: boolean
    /** Field nào đã bị auto-sync */
    field?: 'status' | 'assigneeId'
    /** Giá trị cũ (trước sync) */
    from?: any
    /** Giá trị mới (sau sync) */
    to?: any
}

/**
 * Enforce assigneeId ↔ status invariant.
 * Mutates `updateData` in-place để giữ 2 field consistent.
 *
 * @param updateData - Object sẽ được pass vào prisma.task.update({ data: updateData }).
 *                     Được MUTATE in-place nếu cần sync.
 * @param currentTask - Task hiện tại trong DB (để biết giá trị trước khi update).
 *                      Optional — nếu không cung cấp, chỉ check fields trong updateData.
 */
export function enforceAssigneeStatusInvariant(
    updateData: Record<string, any>,
    currentTask?: { assigneeId: string | null; status: string } | null,
): InvariantResult {
    // Giá trị SAU update (merge updateData lên currentTask)
    const effectiveAssigneeId = 'assigneeId' in updateData
        ? updateData.assigneeId
        : currentTask?.assigneeId ?? null
    const effectiveStatus = 'status' in updateData
        ? updateData.status
        : currentTask?.status ?? QUEUE_STATUS

    // Case 1: assigneeId được SET (non-null) nhưng status sẽ là "Đang đợi giao"
    // → Task có người nhận nhưng vẫn ở queue → auto-sync status → "Nhận task"
    if (effectiveAssigneeId && effectiveStatus === QUEUE_STATUS) {
        if ('assigneeId' in updateData && !('status' in updateData)) {
            // assigneeId thay đổi, status không explicit set → auto-sync status
            updateData.status = DEFAULT_ASSIGNED_STATUS
            return { synced: true, field: 'status', from: QUEUE_STATUS, to: DEFAULT_ASSIGNED_STATUS }
        }
        if ('status' in updateData && !('assigneeId' in updateData)) {
            // status set về "Đang đợi giao" nhưng task đang có assignee → auto-clear assignee
            updateData.assigneeId = null
            updateData.deadline = null
            return { synced: true, field: 'assigneeId', from: effectiveAssigneeId, to: null }
        }
        // Cả 2 field đều explicit trong updateData nhưng conflict → ưu tiên assigneeId
        // (assigning someone = intent rõ ràng hơn)
        if ('assigneeId' in updateData && 'status' in updateData) {
            updateData.status = DEFAULT_ASSIGNED_STATUS
            return { synced: true, field: 'status', from: QUEUE_STATUS, to: DEFAULT_ASSIGNED_STATUS }
        }
    }

    // Case 2: assigneeId bị CLEAR (null) nhưng status không phải "Đang đợi giao"
    // → Task không có người nhận nhưng không ở queue → auto-sync status → "Đang đợi giao"
    if (!effectiveAssigneeId && effectiveStatus !== QUEUE_STATUS) {
        if ('assigneeId' in updateData && !('status' in updateData)) {
            // assigneeId bị clear, status không explicit set → auto-sync status
            updateData.status = QUEUE_STATUS
            updateData.deadline = null
            return { synced: true, field: 'status', from: effectiveStatus, to: QUEUE_STATUS }
        }
    }

    return { synced: false }
}

/**
 * Read-only check — task có consistent assigneeId/status không?
 * Dùng cho diagnostic script, KHÔNG mutate gì.
 */
export function isAssigneeStatusConsistent(
    task: { assigneeId: string | null; status: string },
): boolean {
    if (!task.assigneeId && task.status !== QUEUE_STATUS) return false
    if (task.assigneeId && task.status === QUEUE_STATUS) return false
    return true
}
