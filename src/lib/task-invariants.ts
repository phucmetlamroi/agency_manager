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

/* ════════════════════════════════════════════════════════════════════════ */
/*  Status ↔ Deadline invariant                                             */
/*                                                                          */
/*  Spec (Sprint A finalized + bug fix sau Timeline 6+7):                   */
/*    - status ∈ ['Revision', 'Hoàn tất']  →  deadline phải = null          */
/*      (task đã ở giai đoạn review/done → không còn deadline để overdue)   */
/*    - status khác                        →  deadline không bị đụng       */
/*                                                                          */
/*  Reason: Cron `check-deadline` chạy mỗi giờ flag task có deadline đã     */
/*  qua mà status không in ['Hoàn tất','Đã hủy','Quá hạn'] → user bị flag  */
/*  "Quá hạn" oan trong khi đang ở Revision chờ admin review.              */
/*                                                                          */
/*  Single source of truth — apply ở mọi path mutate task.status:          */
/*    - task-actions.ts updateTaskStatus (single)                          */
/*    - bulk-task-actions.ts bulkUpdateStatus (drag-drop)                  */
/*    - bulk-task-actions.ts bulkUpdateTaskStatus (BulkEditTaskModal)     */
/*    - bulk-task-actions.ts bulkUpdateTaskDetails (superadmin raw)       */
/*    - task-management-actions.ts updateTask (superadmin)                */
/* ════════════════════════════════════════════════════════════════════════ */

/** Status nào yêu cầu deadline=null (per Sprint A spec). */
export const STATUS_REQUIRES_NULL_DEADLINE = ['Revision', 'Hoàn tất'] as const

/**
 * Enforce status → deadline=null invariant.
 * Mutates `updateData` in-place: nếu status mới (trong updateData hoặc fall-back
 * currentTask) thuộc STATUS_REQUIRES_NULL_DEADLINE → set deadline=null.
 *
 * Safe to call ngay cả khi updateData không chứa status — sẽ check currentTask.status.
 *
 * @param updateData - Object pass vào prisma.task.update({ data: updateData }).
 *                     Mutated in-place khi cần clear deadline.
 * @param currentTask - Task hiện tại trong DB (optional, dùng nếu updateData
 *                      không có status field nhưng task đã ở Revision).
 */
export function enforceStatusDeadlineInvariant(
    updateData: Record<string, any>,
    currentTask?: { status: string } | null,
): InvariantResult {
    // Status sau update (merge updateData lên currentTask)
    const effectiveStatus = 'status' in updateData
        ? updateData.status
        : currentTask?.status

    if (!effectiveStatus) return { synced: false }

    // Nếu status thuộc list "deadline-null required" và deadline hiện tại
    // không null (hoặc explicit set non-null trong updateData) → clear.
    if (STATUS_REQUIRES_NULL_DEADLINE.includes(effectiveStatus as any)) {
        // Chỉ sync nếu deadline chưa được clear explicit trong updateData
        if (!('deadline' in updateData) || updateData.deadline !== null) {
            const from = 'deadline' in updateData ? updateData.deadline : 'unknown'
            updateData.deadline = null
            return { synced: true, field: 'status' as any, from, to: null }
        }
    }

    return { synced: false }
}

/** Read-only check — task có consistent status/deadline không? */
export function isStatusDeadlineConsistent(
    task: { status: string; deadline: Date | null },
): boolean {
    if (STATUS_REQUIRES_NULL_DEADLINE.includes(task.status as any) && task.deadline !== null) {
        return false
    }
    return true
}
