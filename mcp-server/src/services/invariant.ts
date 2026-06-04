/**
 * Copy of src/lib/task-invariants.ts — zero external dependencies.
 * Enforces assigneeId <-> status invariant for MCP server task mutations.
 */

const QUEUE_STATUS = 'Đang đợi giao'
const DEFAULT_ASSIGNED_STATUS = 'Nhận task'

export interface InvariantResult {
    synced: boolean
    field?: 'status' | 'assigneeId'
    from?: any
    to?: any
}

/**
 * Enforce assigneeId <-> status invariant.
 * Mutates updateData in-place to keep both fields consistent.
 */
export function enforceAssigneeStatusInvariant(
    updateData: Record<string, any>,
    currentTask?: { assigneeId: string | null; status: string } | null,
): InvariantResult {
    const effectiveAssigneeId = 'assigneeId' in updateData
        ? updateData.assigneeId
        : currentTask?.assigneeId ?? null
    const effectiveStatus = 'status' in updateData
        ? updateData.status
        : currentTask?.status ?? QUEUE_STATUS

    // Case 1: assigneeId SET (non-null) but status would be queue
    if (effectiveAssigneeId && effectiveStatus === QUEUE_STATUS) {
        if ('assigneeId' in updateData && !('status' in updateData)) {
            updateData.status = DEFAULT_ASSIGNED_STATUS
            return { synced: true, field: 'status', from: QUEUE_STATUS, to: DEFAULT_ASSIGNED_STATUS }
        }
        if ('status' in updateData && !('assigneeId' in updateData)) {
            updateData.assigneeId = null
            updateData.deadline = null
            return { synced: true, field: 'assigneeId', from: effectiveAssigneeId, to: null }
        }
        if ('assigneeId' in updateData && 'status' in updateData) {
            updateData.status = DEFAULT_ASSIGNED_STATUS
            return { synced: true, field: 'status', from: QUEUE_STATUS, to: DEFAULT_ASSIGNED_STATUS }
        }
    }

    // Case 2: assigneeId CLEARED but status not queue
    if (!effectiveAssigneeId && effectiveStatus !== QUEUE_STATUS) {
        if ('assigneeId' in updateData && !('status' in updateData)) {
            updateData.status = QUEUE_STATUS
            updateData.deadline = null
            return { synced: true, field: 'status', from: effectiveStatus, to: QUEUE_STATUS }
        }
    }

    return { synced: false }
}

export function isAssigneeStatusConsistent(
    task: { assigneeId: string | null; status: string },
): boolean {
    if (!task.assigneeId && task.status !== QUEUE_STATUS) return false
    if (task.assigneeId && task.status === QUEUE_STATUS) return false
    return true
}
