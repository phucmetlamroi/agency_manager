/**
 * Marketplace service for MCP server.
 * Manages the task marketplace (open/close, listing, claiming, returning).
 */
import { prisma } from '../prisma-client.js'
import { getMcpAuthContext, validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'
import { assertWorkspaceMember } from './guards.js'
import { writeMcpAudit } from './audit.js'

// ---------------------------------------------------------------------------
// toggleMarketplace
// ---------------------------------------------------------------------------

export async function toggleMarketplace(
    wsId: string,
    enabled: boolean,
) {
    await validateWorkspaceAccess(wsId)

    // [AUDIT HT-040] Mở/đóng chợ task quyết định ai tự nhận được việc gì — thay đổi phạm vi cả
    // workspace, trước đây không để lại vết.
    const updated = await prisma.$transaction(async (tx) => {
        // Đọc giá trị CŨ THẬT chứ không suy ra `!enabled`: bật lại một chợ vốn đã mở là no-op, và
        // ghi "trước: đóng" vào nhật ký là bịa ra một thay đổi chưa từng xảy ra.
        const prev = await tx.workspace.findUnique({
            where: { id: wsId },
            select: { marketplaceOpen: true },
        })

        const row = await tx.workspace.update({
            where: { id: wsId },
            data: { marketplaceOpen: enabled },
            select: { id: true, name: true, marketplaceOpen: true },
        })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'workspace.updated',
            targetType: 'Workspace',
            targetId: wsId,
            before: { marketplaceOpen: prev?.marketplaceOpen ?? null },
            after: { marketplaceOpen: row.marketplaceOpen },
            // Chữ ký hàm này không nhận profileId, nhưng service-account vẫn lấy được từ context —
            // để trống sẽ tạo ra dòng nhật ký MCP duy nhất không truy được thuộc profile nào.
            mcpProfileId: getMcpAuthContext().profileId,
        })

        return row
    })

    return {
        workspaceId: updated.id,
        name: updated.name,
        marketplaceOpen: updated.marketplaceOpen,
    }
}

// ---------------------------------------------------------------------------
// listMarketplaceTasks
// ---------------------------------------------------------------------------

export async function listMarketplaceTasks(
    wsId: string,
    profileId: string,
) {
    await validateWorkspaceAccess(wsId)

    // Check marketplace status first
    const workspace = await prisma.workspace.findUnique({
        where: { id: wsId },
        select: { marketplaceOpen: true },
    })

    if (!workspace) throw new Error(`Workspace ${wsId} not found`)

    if (!workspace.marketplaceOpen) {
        return { tasks: [], marketplaceOpen: false }
    }

    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const tasks = await wsPrisma.task.findMany({
        where: {
            status: 'Đang đợi giao',
            assigneeId: null,
            isArchived: false,
        },
        include: {
            client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
    })

    return {
        tasks: tasks.map((t: any) => ({
            id: t.id,
            title: t.title,
            type: t.type,
            status: t.status,
            deadline: t.deadline?.toISOString() ?? null,
            value: Number(t.value ?? 0),
            jobPriceUSD: Number(t.jobPriceUSD ?? 0),
            wageVND: Number(t.wageVND ?? 0),
            duration: t.duration ?? null,
            client: t.client ? { id: t.client.id, name: t.client.name } : null,
            createdAt: t.createdAt.toISOString(),
        })),
        marketplaceOpen: true,
    }
}

// ---------------------------------------------------------------------------
// claimTask
// ---------------------------------------------------------------------------

export async function claimTask(
    wsId: string,
    profileId: string,
    taskId: string,
    userId: string,
) {
    await validateWorkspaceAccess(wsId)

    if (!userId) throw new Error('userId is required to claim a task')
    // [AUDIT HT-036 fix] The claiming user must be a member of this workspace.
    await assertWorkspaceMember(wsId, userId)

    // Use raw prisma for the transaction (optimistic locking pattern)
    const result = await prisma.$transaction(async (tx) => {
        // 1. Verify marketplace is open (inside transaction to close TOCTOU gap)
        const ws = await tx.workspace.findUnique({
            where: { id: wsId },
            select: { marketplaceOpen: true },
        })
        if (!ws?.marketplaceOpen) {
            throw new Error('Marketplace is currently closed')
        }

        // 2. Fetch task with version for optimistic locking
        const task = await tx.task.findFirst({
            where: { id: taskId, workspaceId: wsId },
            select: {
                id: true,
                assigneeId: true,
                status: true,
                version: true,
                isArchived: true,
            },
        })

        if (!task) throw new Error(`Task ${taskId} not found`)
        if (task.isArchived) throw new Error('Task is archived')
        if (task.assigneeId) throw new Error('Task is already assigned')
        if (task.status !== 'Đang đợi giao') {
            throw new Error('Task is not in queue status')
        }

        // 3. Atomic update with version check to prevent race conditions
        const updateResult = await tx.task.updateMany({
            where: {
                id: taskId,
                version: task.version,
                assigneeId: null,
            },
            data: {
                assigneeId: userId,
                status: 'Nhận task',
                claimSource: 'MARKET',
                claimedAt: new Date(),
                version: { increment: 1 },
            },
        })

        if (updateResult.count === 0) {
            throw new Error('Task was claimed by another user (optimistic lock conflict)')
        }

        // [AUDIT HT-040] Đây là thao tác MCP DUY NHẤT có người thật đứng sau: người tự nhận việc.
        // Nên actorUserId ghi được tên thật, khác mọi chỗ khác phải để null (service-account MCP
        // không có hàng User để trỏ khoá ngoại tới).
        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.assigned',
            targetType: 'Task',
            targetId: taskId,
            actorUserId: userId,
            before: { assigneeId: null, status: task.status },
            after: { assigneeId: userId, status: 'Nhận task', claimSource: 'MARKET' },
            mcpProfileId: profileId,
        })

        return {
            taskId,
            assigneeId: userId,
            status: 'Nhận task',
            claimSource: 'MARKET',
        }
    })

    return result
}

// ---------------------------------------------------------------------------
// returnTask
// ---------------------------------------------------------------------------

export async function returnTask(
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
        return { taskId, status: task.status, changed: false }
    }

    const updateData: Record<string, any> = {
        assigneeId: null,
        assignedAgencyId: null,
        status: 'Đang đợi giao',
        isPenalized: false,
        deadline: null,
        claimSource: 'ADMIN',
    }

    enforceAssigneeStatusInvariant(updateData, task)

    // [AUDIT HT-040] Trả task về chợ = gỡ người nhận + đổi trạng thái; cũng phải để lại vết.
    const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.task.update({
            where: { id: taskId, workspaceId: wsId, profileId },
            data: { ...updateData, version: { increment: 1 } }, // [AUDIT SWEEP · P6-SWEEP-2 — sổ bỏ sót đường này]
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
