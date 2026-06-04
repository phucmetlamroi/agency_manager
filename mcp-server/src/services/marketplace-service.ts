/**
 * Marketplace service for MCP server.
 * Manages the task marketplace (open/close, listing, claiming, returning).
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'

// ---------------------------------------------------------------------------
// toggleMarketplace
// ---------------------------------------------------------------------------

export async function toggleMarketplace(
    wsId: string,
    enabled: boolean,
) {
    await validateWorkspaceAccess(wsId)

    const updated = await prisma.workspace.update({
        where: { id: wsId },
        data: { marketplaceOpen: enabled },
        select: { id: true, name: true, marketplaceOpen: true },
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

    const updated = await wsPrisma.task.update({
        where: { id: taskId },
        data: updateData,
        select: {
            id: true,
            status: true,
            assigneeId: true,
            version: true,
        },
    })

    return {
        taskId: updated.id,
        status: updated.status,
        assigneeId: updated.assigneeId,
        version: updated.version,
        changed: true,
    }
}
