/**
 * Task CRUD service for MCP server.
 * Handles creation, retrieval, listing, deletion, and detail updates.
 * All mutations enforce the assigneeId <-> status invariant.
 */
import { prisma } from '../prisma-client.js'
import { validateWorkspaceAccess } from '../auth-context.js'
import { getWorkspacePrisma } from '../workspace-scoping.js'
import { enforceAssigneeStatusInvariant } from './invariant.js'
import { isValidStatus, type TaskStatus } from './statuses.js'
import { assertWorkspaceMember, assertClientInProfile, assertNotRedCarded } from './guards.js'
import { sanitizeExternalUrl } from '../safe-url.js'
import { writeMcpAudit } from './audit.js'

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

    if (!data.title || data.title.trim().length === 0) {
        throw new Error('Task title is required')
    }
    // [AUDIT HT-041 fix] The clientId must belong to THIS profile — otherwise a caller could
    // attach a new task to a client from another tenant.
    await assertClientInProfile(data.clientId)
    // [AUDIT HT-036 fix] If an assignee is given, they must be a member of this workspace.
    if (data.assigneeId) {
        await assertWorkspaceMember(wsId, data.assigneeId)
        // [AUDIT SWEEP-2026-07-30 fix · P6-SWEEP-1] Cửa phụ cùng lớp: gán assigneeId qua create_task /
        // update_task_details cũng phải qua chốt thẻ đỏ, không chỉ assign_task.
        await assertNotRedCarded(wsId, data.assigneeId)
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

    // [AUDIT HT-040] Ghi nhật ký trong cùng transaction với create.
    // ⚠️ Với `create`, extension của wsPrisma bơm workspaceId + profileId vào `data` (chứ không
    // phải `where` như các thao tác khác) — chuyển sang `prisma` gốc thì phải chép tay cả hai,
    // thiếu workspaceId là tạo ra task mồ côi không thuộc workspace nào.
    const task = await prisma.$transaction(async (tx) => {
        const row = await tx.task.create({
            data: { ...createData, workspaceId: wsId, profileId } as any,
            include: {
                client: { select: { id: true, name: true } },
                assignee: { select: { id: true, username: true, displayName: true } },
            },
        })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.created',
            targetType: 'Task',
            targetId: row.id,
            after: {
                title: row.title,
                status: row.status,
                assigneeId: row.assigneeId,
                clientId: row.clientId,
            },
            mcpProfileId: profileId,
        })

        return row
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

    // [AUDIT HT-040] Xoá task là thao tác KHÔNG hoàn tác được, và trước đây nó biến mất khỏi hệ
    // thống mà không để lại gì cả. Chụp lại tiêu đề + trạng thái + tiền vào `beforeData` — sau khi
    // hàng đã bị xoá thì đây là bằng chứng duy nhất còn lại.
    // Lưu ý: hàm này gọi getWorkspacePrisma(wsId) KHÔNG kèm profileId, nên `where` chỉ chép lại
    // workspaceId — thêm profileId ở đây sẽ SIẾT quyền hơn bản gốc và làm hỏng các lời gọi hợp lệ.
    await prisma.$transaction(async (tx) => {
        await tx.task.delete({ where: { id: taskId, workspaceId: wsId } })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.deleted',
            targetType: 'Task',
            targetId: taskId,
            before: {
                title: (task as any).title ?? null,
                status: (task as any).status ?? null,
                assigneeId: (task as any).assigneeId ?? null,
                value: String((task as any).value ?? ''),
                jobPriceUSD: String((task as any).jobPriceUSD ?? ''),
            },
        })
    })

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
    // [AUDIT SWEEP fix · MCP-PAID] Giữ giá trị trả về — `ws.name` là nguồn suy chu kỳ lương, và
    // `validateWorkspaceAccess` đã select `name` sẵn nên KHÔNG cần truy vấn thêm.
    const ws = await validateWorkspaceAccess(wsId)
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
    // [AUDIT HT-031 fix] productLink được render làm `href` ở portal KHÁCH và app nội bộ, mà
    // React không chặn `javascript:` trong href — nên đây phải lọc scheme y như các đường ghi
    // bên web. Khả năng tiếp cận thấp (MCP chạy stdio trên máy chủ sở hữu), nhưng để hở một
    // đường ghi là đủ để lỗ hổng sống lại.
    if (data.productLink !== undefined) updateData.productLink = sanitizeExternalUrl(data.productLink)
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
        // [AUDIT SWEEP-2026-07-30 fix · MCP-PAID] CHỐT KỲ LƯƠNG ĐÃ ĐÓNG.
        // Web có chốt này (src/lib/payroll-lock.ts); MCP trước đây KHÔNG có một truy vấn Payroll nào,
        // nên ghi được jobPriceUSD/value/wageVND/profitVND của kỳ ĐÃ TRẢ — và vì ba cột được ghi đồng
        // bộ nên số đổi "gọn gàng", không để lại dấu lệch cột như đường bulk của web từng có.
        // reachable=false (stdio cục bộ, service-account của chính chủ profile) nên đây là parity +
        // chống bẫy tương lai, không phải lỗ đang mở. Quyết định của chủ dự án: vẫn làm.
        // Chỉ kiểm khi THẬT SỰ đụng tiền — đặt trong đúng nhánh này, không gác cả hàm.
        const { assertPayrollCycleOpen } = await import('./payroll-cycle.js')
        await assertPayrollCycleOpen(wsId, ws.name, currentTask.assigneeId ?? null)

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
        // [AUDIT HT-036 fix] A newly-set assignee must be a member of this workspace.
        if (data.assigneeId) {
            await assertWorkspaceMember(wsId, data.assigneeId)
        // [AUDIT SWEEP-2026-07-30 fix · P6-SWEEP-1] Cửa phụ cùng lớp: gán assigneeId qua create_task /
        // update_task_details cũng phải qua chốt thẻ đỏ, không chỉ assign_task.
        await assertNotRedCarded(wsId, data.assigneeId)
        }
        updateData.assigneeId = data.assigneeId || null
        enforceAssigneeStatusInvariant(updateData, currentTask)
    }

    // [AUDIT HT-040] Đây là đường MCP sửa được jobPriceUSD / value / wageVND / profitVND — tức là
    // đổi thẳng số tiền phải trả cho editor — mà trước đây không sinh dòng nhật ký nào.
    // Decimal của Prisma không nằm gọn trong cột Json, nên các trường tiền được ép String().
    const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.task.update({
            where: { id: taskId, workspaceId: wsId, profileId },
            data: { ...updateData, version: { increment: 1 } }, // [AUDIT SWEEP · P6-SWEEP-2]
            include: {
                client: { select: { id: true, name: true } },
                assignee: { select: { id: true, username: true, displayName: true } },
            },
        })

        await writeMcpAudit(tx, {
            workspaceId: wsId,
            action: 'task.bulk_updated',
            targetType: 'Task',
            targetId: taskId,
            before: {
                status: currentTask.status,
                assigneeId: currentTask.assigneeId,
                jobPriceUSD: String(currentTask.jobPriceUSD ?? ''),
                value: String(currentTask.value ?? ''),
            },
            after: {
                count: 1,
                changedFields: Object.keys(updateData),
                status: row.status,
                assigneeId: row.assigneeId,
                jobPriceUSD: String(row.jobPriceUSD ?? ''),
                value: String(row.value ?? ''),
            },
            mcpProfileId: profileId,
        })

        return row
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
