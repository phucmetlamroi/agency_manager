/**
 * Status transition service for MCP server.
 * Validates transitions, enforces invariants, and provides audit history.
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'
import { isValidStatus, VALID_TASK_STATUSES, type TaskStatus } from './statuses.js'
import { writeMcpAudit } from './audit.js'

// ---------------------------------------------------------------------------
// Status transition blocklist
// ---------------------------------------------------------------------------
// Certain backward transitions indicate data corruption or misuse.
// MCP is less restrictive than the FSM (which is currently disabled in the
// web app), but we still block clearly nonsensical jumps.

const BLOCKED_TRANSITIONS: Record<string, string[]> = {
    'Hoàn tất': ['Đang thực hiện', 'Nhận task', 'Đang đợi giao'],
    // [bug-report #2] 'Sửa frame' / 'Gửi lại' removed from the predecessor list (no longer valid statuses).
    'Đã hủy': ['Đang thực hiện', 'Nhận task', 'Đang đợi giao', 'Revision'],
}

// Statuses where deadline should be cleared automatically ('Tạm ngưng' removed — bug-report #2).
const DEADLINE_CLEAR_STATUSES: readonly string[] = ['Revision'] as const

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------

export async function updateTaskStatus(
    wsId: string,
    profileId: string,
    taskId: string,
    newStatus: string,
) {
    await validateWorkspaceAccess(wsId)

    // 1. Validate newStatus is canonical
    if (!isValidStatus(newStatus)) {
        throw new Error(
            `Invalid status "${newStatus}". Allowed: ${VALID_TASK_STATUSES.join(', ')}`,
        )
    }

    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    // 2. Fetch current task
    const task = await wsPrisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            status: true,
            assigneeId: true,
            version: true,
            isArchived: true,
        },
    })
    if (!task) throw new Error(`Task ${taskId} not found`)

    // 3. Validate transition is reasonable
    const currentStatus = task.status
    if (currentStatus === newStatus) {
        // No-op: already in that status
        return { taskId, status: newStatus, changed: false }
    }

    const blocked = BLOCKED_TRANSITIONS[currentStatus]
    if (blocked && blocked.includes(newStatus)) {
        throw new Error(
            `Transition from "${currentStatus}" to "${newStatus}" is not allowed`,
        )
    }

    // 4. Build update payload
    const updateData: Record<string, any> = {
        status: newStatus,
        version: { increment: 1 },
    }

    // Clear deadline for restricted statuses
    if ((DEADLINE_CLEAR_STATUSES as readonly string[]).includes(newStatus)) {
        updateData.deadline = null
    }

    // [Task-loss A2] Cancelling → ARCHIVE, exactly like the web app (src/actions/task-actions.ts:
    // "auto-archive on cancel"). An 'Đã hủy' row left isArchived:false matches NO board tab AND is
    // absent from /admin/cancelled (which lists isArchived:true) → a counted-but-invisible ghost.
    if (newStatus === 'Đã hủy') {
        updateData.isArchived = true
    }

    // 5. Enforce invariant (assigneeId <-> status consistency)
    enforceAssigneeStatusInvariant(updateData, task)

    // 6. Execute update + vết kiểm toán, NGUYÊN TỬ
    // [AUDIT HT-040] Trước đây đây là một `wsPrisma.task.update` trần: task đổi trạng thái sang
    // 'Hoàn tất' (⇒ tính lương) mà không sinh dòng AuditLog nào, nên `getStatusHistory` ngay bên
    // dưới trả về [] và /admin/audit-log mù hoàn toàn với mọi thay đổi đến từ MCP.
    // Ghi nhật ký nằm TRONG cùng transaction: mutation hỏng thì không có log rác, mà log hỏng thì
    // mutation cũng không lặng lẽ đi qua.
    // ⚠️ Phải dùng `prisma` GỐC (không phải wsPrisma) vì extension bơm `profileId` vào mọi
    // `create` — bảng AuditLog không có cột đó. Đổi lại, hai khoá phạm vi mà extension vẫn tự bơm
    // cho `update` phải chép lại BẰNG TAY ở `where` dưới đây; bỏ chúng là mở đường sửa chéo-tenant.
    const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.task.update({
            where: { id: taskId, workspaceId: wsId, profileId },
            data: updateData,
            select: {
                id: true,
                status: true,
                assigneeId: true,
                version: true,
                deadline: true,
            },
        })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.status_updated',
            targetType: 'Task',
            targetId: taskId,
            before: { status: currentStatus, assigneeId: task.assigneeId },
            after: { status: row.status, assigneeId: row.assigneeId },
            mcpProfileId: profileId,
        })

        return row
    })

    return {
        taskId: updated.id,
        status: updated.status,
        assigneeId: updated.assigneeId,
        version: updated.version,
        deadline: updated.deadline?.toISOString() ?? null,
        changed: true,
    }
}

// ---------------------------------------------------------------------------
// getStatusHistory
// ---------------------------------------------------------------------------

export async function getStatusHistory(
    wsId: string,
    taskId: string,
) {
    await validateWorkspaceAccess(wsId)

    // AuditLog stores workspace-scoped events. Query by workspaceId + targetId.
    const logs = await prisma.auditLog.findMany({
        where: {
            workspaceId: wsId,
            targetType: 'Task',
            targetId: taskId,
            action: { startsWith: 'task.' },
        },
        select: {
            id: true,
            action: true,
            actorUserId: true,
            beforeData: true,
            afterData: true,
            createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
    })

    return logs.map((log) => ({
        id: String(log.id),
        action: log.action,
        actorUserId: log.actorUserId,
        beforeData: log.beforeData,
        afterData: log.afterData,
        createdAt: log.createdAt.toISOString(),
    }))
}
