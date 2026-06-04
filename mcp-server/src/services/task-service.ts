/**
 * Task CRUD service for MCP server.
 * Handles creation, retrieval, listing, deletion, and detail updates.
 * All mutations enforce the assigneeId <-> status invariant.
 */
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'
import { isValidStatus, type TaskStatus } from './statuses.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
    title: string
    clientId: number
    type?: string
    assigneeId?: string
    deadline?: string | Date
    jobPriceUSD?: number
    value?: number
    notes?: string
}

export interface ListTasksFilters {
    status?: string
    assigneeId?: string
    clientId?: number
    isArchived?: boolean
    limit?: number
    offset?: number
}

export interface UpdateTaskDetailsInput {
    productLink?: string | null
    deadline?: string | Date | null
    jobPriceUSD?: number | null
    value?: number | null
    resources?: string | null
    references?: string | null
    notes?: string | null
    type?: string
    assigneeId?: string | null
}

// ---------------------------------------------------------------------------
// createTask
// ---------------------------------------------------------------------------

export async function createTask(
    wsId: string,
    profileId: string,
    data: CreateTaskInput,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    if (!data.title || data.title.trim().length === 0) {
        throw new Error('Task title is required')
    }

    const createData: Record<string, any> = {
        title: data.title.trim(),
        clientId: data.clientId,
        type: data.type ?? 'Short form',
        status: 'Đang đợi giao',
    }

    if (data.assigneeId) {
        createData.assigneeId = data.assigneeId
        // Enforce invariant: if assignee is set, status must not be queue
        enforceAssigneeStatusInvariant(createData)
    }

    if (data.deadline) {
        createData.deadline = new Date(data.deadline)
    }
    if (data.jobPriceUSD !== undefined) {
        createData.jobPriceUSD = data.jobPriceUSD
    }
    if (data.value !== undefined) {
        createData.value = data.value
        createData.wageVND = data.value
    }
    if (data.notes !== undefined) {
        createData.notes_vi = data.notes
    }

    const task = await wsPrisma.task.create({
        data: createData as any,
        include: {
            client: { select: { id: true, name: true } },
            assignee: { select: { id: true, username: true, displayName: true } },
        },
    })

    return serializeTask(task)
}

// ---------------------------------------------------------------------------
// getTask
// ---------------------------------------------------------------------------

export async function getTask(
    wsId: string,
    profileId: string,
    taskId: string,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const task = await wsPrisma.task.findUnique({
        where: { id: taskId },
        include: {
            client: { select: { id: true, name: true } },
            assignee: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        },
    })

    if (!task) throw new Error(`Task ${taskId} not found`)

    return serializeTask(task)
}

// ---------------------------------------------------------------------------
// listTasks
// ---------------------------------------------------------------------------

export async function listTasks(
    wsId: string,
    profileId: string,
    filters: ListTasksFilters = {},
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const where: Record<string, any> = {}

    if (filters.status !== undefined) {
        if (!isValidStatus(filters.status)) {
            throw new Error(`Invalid status filter: "${filters.status}"`)
        }
        where.status = filters.status
    }
    if (filters.assigneeId !== undefined) {
        where.assigneeId = filters.assigneeId
    }
    if (filters.clientId !== undefined) {
        where.clientId = filters.clientId
    }
    if (filters.isArchived !== undefined) {
        where.isArchived = filters.isArchived
    }

    const limit = Math.min(filters.limit ?? 50, 200)
    const offset = filters.offset ?? 0

    const [tasks, total] = await Promise.all([
        wsPrisma.task.findMany({
            where,
            include: {
                client: { select: { id: true, name: true } },
                assignee: { select: { id: true, username: true, displayName: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
        }),
        wsPrisma.task.count({ where }),
    ])

    return {
        tasks: tasks.map(serializeTask),
        total,
        limit,
        offset,
    }
}

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------

export async function deleteTask(
    wsId: string,
    taskId: string,
) {
    await validateWorkspaceAccess(wsId)
    // Admin action: use workspace-scoped prisma without profileId restriction
    const wsPrisma = getWorkspacePrisma(wsId)

    const task = await wsPrisma.task.findUnique({ where: { id: taskId } })
    if (!task) throw new Error(`Task ${taskId} not found`)

    await wsPrisma.task.delete({ where: { id: taskId } })

    return { deleted: true, taskId }
}

// ---------------------------------------------------------------------------
// updateTaskDetails
// ---------------------------------------------------------------------------

export async function updateTaskDetails(
    wsId: string,
    profileId: string,
    taskId: string,
    data: UpdateTaskDetailsInput,
) {
    await validateWorkspaceAccess(wsId)
    const wsPrisma = getWorkspacePrisma(wsId, profileId)

    const currentTask = await wsPrisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            assigneeId: true,
            status: true,
            jobPriceUSD: true,
            value: true,
            exchangeRate: true,
        },
    })
    if (!currentTask) throw new Error(`Task ${taskId} not found`)

    const updateData: Record<string, any> = {}

    // Non-financial fields
    if (data.productLink !== undefined) updateData.productLink = data.productLink
    if (data.resources !== undefined) updateData.resources = data.resources
    if (data.references !== undefined) updateData.references = data.references
    if (data.notes !== undefined) updateData.notes_vi = data.notes
    if (data.type !== undefined) updateData.type = data.type

    // Deadline
    if (data.deadline !== undefined) {
        updateData.deadline = data.deadline ? new Date(data.deadline) : null
    }

    // Financial fields with profit recalculation
    if (data.jobPriceUSD !== undefined || data.value !== undefined) {
        const newJobPriceUSD = data.jobPriceUSD !== undefined
            ? (data.jobPriceUSD ?? 0)
            : Number(currentTask.jobPriceUSD ?? 0)
        const newValue = data.value !== undefined
            ? (data.value ?? 0)
            : Number(currentTask.value ?? 0)
        const rate = Number(currentTask.exchangeRate ?? 26300)

        updateData.jobPriceUSD = newJobPriceUSD
        updateData.value = newValue
        updateData.wageVND = newValue
        updateData.profitVND = (newJobPriceUSD * rate) - newValue
    }

    // Assignee change
    if (data.assigneeId !== undefined) {
        updateData.assigneeId = data.assigneeId || null
        enforceAssigneeStatusInvariant(updateData, currentTask)
    }

    const updated = await wsPrisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: {
            client: { select: { id: true, name: true } },
            assignee: { select: { id: true, username: true, displayName: true } },
        },
    })

    return serializeTask(updated)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeTask(task: any) {
    return {
        id: task.id,
        title: task.title,
        status: task.status,
        type: task.type,
        deadline: task.deadline?.toISOString?.() ?? task.deadline ?? null,
        value: Number(task.value ?? 0),
        jobPriceUSD: Number(task.jobPriceUSD ?? 0),
        wageVND: Number(task.wageVND ?? 0),
        profitVND: Number(task.profitVND ?? 0),
        productLink: task.productLink ?? null,
        resources: task.resources ?? null,
        references: task.references ?? null,
        notes: task.notes_vi ?? null,
        isArchived: task.isArchived ?? false,
        version: task.version ?? 0,
        assigneeId: task.assigneeId ?? null,
        clientId: task.clientId ?? null,
        createdAt: task.createdAt?.toISOString?.() ?? task.createdAt ?? null,
        updatedAt: task.updatedAt?.toISOString?.() ?? task.updatedAt ?? null,
        client: task.client
            ? { id: task.client.id, name: task.client.name }
            : null,
        assignee: task.assignee
            ? {
                id: task.assignee.id,
                username: task.assignee.username,
                displayName: task.assignee.displayName ?? null,
            }
            : null,
    }
}
