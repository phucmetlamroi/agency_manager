/**
 * Assignment service for MCP server.
 * Handles assigning, unassigning, and bulk-assigning tasks.
 * All mutations enforce the assigneeId <-> status invariant.
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'

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
                data: { ...updateData, profileId },
                select: { id: true, status: true, assigneeId: true },
            })

            outcomes.push({
                taskId: updated.id,
                status: updated.status,
                assigneeId: updated.assigneeId,
                success: true,
            })
        }

        return outcomes
    })

    const successCount = results.filter((r) => r.success).length
    return { results, total: taskIds.length, successCount }
}
