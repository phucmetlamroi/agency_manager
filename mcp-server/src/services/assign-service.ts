/**
 * Assignment service for MCP server.
 * Handles assigning, unassigning, and bulk-assigning tasks.
 * All mutations enforce the assigneeId <-> status invariant.
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'
import { assertWorkspaceMember } from './guards.js'
import { writeMcpAudit } from './audit.js'

// ---------------------------------------------------------------------------
// assignTask
// ---------------------------------------------------------------------------

export async function assignTask(
    wsId: string,
    profileId: string,
    taskId: string,
    assigneeId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    if (!assigneeId) {
        throw new Error('assigneeId is required for assignTask')
    }
    // [AUDIT HT-036 fix] The assignee must be a member of THIS workspace — otherwise a caller
    // could assign a task to a user from another workspace/tenant within the profile.
    await assertWorkspaceMember(wsId, assigneeId)
    // [GỠ THẺ ĐỎ 2026-07-31] Chốt Rank D đã bị gỡ ở cả web lẫn MCP — xem `guards.ts`.

    // Verify task exists
    const task = await wsPrisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, assigneeId: true, status: true, isArchived: true },
    })
    if (!task) throw new Error(`Task ${taskId} not found`)
    if (task.isArchived) throw new Error(`Task ${taskId} is archived`)

    // Build update
    const updateData: Record<string, any> = {
        assigneeId,
        status: 'Nhận task',
        claimSource: 'ADMIN',
        claimedAt: new Date(),
    }

    // Enforce invariant (will correct status if needed)
    enforceAssigneeStatusInvariant(updateData, task)

    // [AUDIT HT-040] Giao task qua MCP trước đây không để lại vết nào. Ghi nhật ký nằm trong CÙNG
    // transaction với update — xem chú thích đầu services/audit.ts về lý do phải dùng `prisma` gốc
    // và vì sao hai khoá phạm vi dưới đây phải chép tay.
    const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.task.update({
            where: { id: taskId, workspaceId: wsId, profileId },
            data: { ...updateData, version: { increment: 1 } }, // [AUDIT SWEEP · P6-SWEEP-2]
            select: {
                id: true,
                status: true,
                assigneeId: true,
                version: true,
            },
        })

        // ⚠️ KHÔNG dùng tên 'task.assigned' ở đây, dù đó là tên đúng nghĩa nhất.
        // Hai màn hình ĐANG CHẠY diễn giải "task.assigned + actorUserId null" thành "khách làm":
        //   · Cổng khách — share-portal-actions.ts:1643 `who: r.actorUserId ? 'Nhóm biên tập' : 'You'`
        //   · Drawer nhân viên — task-comment-actions.ts:236 `... : 'Khách hàng'`
        // MCP không có hàng User để làm actor, nên dùng tên đó sẽ khiến cổng khách hiện
        // "Project opened — You" và drawer hiện "Khách hàng đã tạo / giao task". Một bản vá về
        // TRUY VẾT TRUNG THỰC mà lại dựng lên người thực hiện giả thì tệ hơn là không ghi gì.
        // 'task.status_updated' vừa đúng sự thật (giao task có đổi status sang 'Nhận task'), vừa
        // không nằm trong hai bảng nhãn kia nên không bị gán nhầm; ai nhận vẫn nằm ở before/after.
        // (claim_task ở marketplace-service GIỮ 'task.assigned' — chỗ đó có actor người thật.)
        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.status_updated',
            targetType: 'Task',
            targetId: taskId,
            before: { assigneeId: task.assigneeId, status: task.status },
            after: { assigneeId: row.assigneeId, status: row.status },
            mcpProfileId: profileId,
        })

        return row
    })

    return {
        taskId: updated.id,
        status: updated.status,
        assigneeId: updated.assigneeId,
        version: updated.version,
    }
}

// ---------------------------------------------------------------------------
// unassignTask
// ---------------------------------------------------------------------------

export async function unassignTask(
    wsId: string,
    profileId: string,
    taskId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const task = await wsPrisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, assigneeId: true, status: true },
    })
    if (!task) throw new Error(`Task ${taskId} not found`)

    if (!task.assigneeId) {
        // Already unassigned, no-op
        return {
            taskId: task.id,
            status: task.status,
            assigneeId: null,
            changed: false,
        }
    }

    const updateData: Record<string, any> = {
        assigneeId: null,
        assignedAgencyId: null,
        status: 'Đang đợi giao',
        isPenalized: false,
        deadline: null,
    }

    // Enforce invariant (clearing assignee -> queue status)
    enforceAssigneeStatusInvariant(updateData, task)

    // [AUDIT HT-040] Gỡ người nhận cũng là thay đổi trạng thái (task rơi về 'Đang đợi giao') và
    // trước đây cũng không để lại vết.
    const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.task.update({
            where: { id: taskId, workspaceId: wsId, profileId },
            data: { ...updateData, version: { increment: 1 } }, // [AUDIT SWEEP · P6-SWEEP-2]
            select: {
                id: true,
                status: true,
                assigneeId: true,
                version: true,
            },
        })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.status_updated',
            targetType: 'Task',
            targetId: taskId,
            before: { assigneeId: task.assigneeId, status: task.status },
            after: { assigneeId: row.assigneeId, status: row.status },
            mcpProfileId: profileId,
        })

        return row
    })

    return {
        taskId: updated.id,
        status: updated.status,
        assigneeId: updated.assigneeId,
        version: updated.version,
        changed: true,
    }
}

// ---------------------------------------------------------------------------
// bulkAssignTasks
// ---------------------------------------------------------------------------

export async function bulkAssignTasks(
    wsId: string,
    profileId: string,
    taskIds: string[],
    assigneeId: string,
) {
    await validateWorkspaceAccess(wsId)

    if (!assigneeId) {
        throw new Error('assigneeId is required for bulkAssignTasks')
    }
    // [AUDIT HT-036 fix] Verify the assignee belongs to this workspace once, up front.
    await assertWorkspaceMember(wsId, assigneeId)
    // [GỠ THẺ ĐỎ 2026-07-31] Chốt Rank D đã bị gỡ ở cả web lẫn MCP — xem `guards.ts`.
    if (!taskIds || taskIds.length === 0) {
        throw new Error('taskIds array must not be empty')
    }
    if (taskIds.length > 50) {
        throw new Error('Bulk assign limited to 50 tasks per call')
    }

    // Use a transaction via the raw prisma client for atomicity.
    // The workspace-scoped client's $transaction may not be available on
    // extended clients, so we run the transaction on the base prisma and
    // manually scope by workspaceId.
    // [AUDIT HT-040] Nâng hạn mức transaction. Mỗi task nay tốn 3 truy vấn (findFirst + update +
    // auditLog.create) thay vì 2, nên 50 task = 150 lượt đi-về — vượt mặc định 5s của Prisma khi
    // chạy trên Neon (~40ms RTT), và khi vượt thì P2028 làm rollback TOÀN BỘ: không task nào được
    // giao, trong khi bản cũ chạy xong. Các đường bulk khác trong repo đã nâng sẵn vì lý do này
    // (workspace-actions.ts:513, crm-actions.ts:109).
    const results = await prisma.$transaction(async (tx) => {
        const outcomes: Array<{
            taskId: string
            status: string
            assigneeId: string | null
            success: boolean
            error?: string
        }> = []

        for (const taskId of taskIds) {
            const task = await tx.task.findFirst({
                where: { id: taskId, workspaceId: wsId },
                select: { id: true, assigneeId: true, status: true, isArchived: true },
            })

            if (!task) {
                outcomes.push({ taskId, status: '', assigneeId: null, success: false, error: 'Not found' })
                continue
            }
            if (task.isArchived) {
                outcomes.push({ taskId, status: task.status, assigneeId: task.assigneeId, success: false, error: 'Archived' })
                continue
            }

            const updateData: Record<string, any> = {
                assigneeId,
                status: 'Nhận task',
                claimSource: 'ADMIN',
                claimedAt: new Date(),
            }
            enforceAssigneeStatusInvariant(updateData, task)

            const updated = await tx.task.update({
                where: { id: taskId },
                data: { ...updateData, profileId, version: { increment: 1 } }, // [AUDIT SWEEP · P6-SWEEP-2]
                select: { id: true, status: true, assigneeId: true },
            })

            // [AUDIT HT-040] Một dòng nhật ký cho MỖI task, không phải một dòng tổng: bảng lương
            // và mọi truy vết sau này đều tra theo từng task, nên gộp lại là mất dấu.
            // Tên action: xem chú thích dài ở assignTask — 'task.assigned' + actor null bị hai màn
            // hình hiểu thành "khách làm", và ở đây nó sẽ lặp lại tới 50 lần trong một lời gọi.
            await writeMcpAudit(tx, {
                workspaceId: wsId,
                action: 'task.status_updated',
                targetType: 'Task',
                targetId: taskId,
                before: { assigneeId: task.assigneeId, status: task.status },
                after: { assigneeId: updated.assigneeId, status: updated.status },
                mcpProfileId: profileId,
            })

            outcomes.push({
                taskId: updated.id,
                status: updated.status,
                assigneeId: updated.assigneeId,
                success: true,
            })
        }

        return outcomes
    }, { timeout: 30_000, maxWait: 10_000 })

    const successCount = results.filter((r) => r.success).length
    return { results, total: taskIds.length, successCount }
}
