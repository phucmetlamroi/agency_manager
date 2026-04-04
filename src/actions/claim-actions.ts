'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

// ─── Get unassigned tasks for marketplace ─────────────────────
export async function getMarketplaceTasks(workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized', tasks: [] }

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const tasks = await workspacePrisma.task.findMany({
        where: {
            assigneeId: null,
            isArchived: false,
            status: '\u0110ang \u0111\u1ee3i giao' // "Đang đợi giao"
        },
        include: {
            client: {
                include: { parent: { select: { name: true } } }
            },
            taskTags: {
                include: { tagCategory: { select: { id: true, name: true } } }
            }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
    })

    // Serialize Decimal fields
    const serialized = tasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        type: t.type,
        status: t.status,
        deadline: t.deadline?.toISOString() || null,
        value: Number(t.value || 0),
        wageVND: Number(t.wageVND || 0),
        jobPriceUSD: Number(t.jobPriceUSD || 0),
        duration: t.duration,
        client: t.client ? {
            name: t.client.name,
            parent: t.client.parent?.name || null
        } : null,
        tags: t.taskTags?.map((tt: any) => tt.tagCategory) || [],
        createdAt: t.createdAt.toISOString()
    }))

    return { tasks: serialized }
}

// ─── Claim a task from marketplace ────────────────────────────
export async function claimTask(taskId: string, workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const userId = session.user.id
    const workspacePrisma = getWorkspacePrisma(workspaceId)

    // Use transaction with optimistic locking to prevent race conditions
    try {
        const result = await (workspacePrisma as any).$transaction(async (tx: any) => {
            // Fetch task with current version
            const task = await tx.task.findUnique({
                where: { id: taskId },
                select: { id: true, assigneeId: true, status: true, version: true, isArchived: true }
            })

            if (!task) throw new Error('Task không tồn tại')
            if (task.isArchived) throw new Error('Task đã bị lưu trữ')
            if (task.assigneeId) throw new Error('Task đã được nhận bởi người khác')
            if (task.status !== '\u0110ang \u0111\u1ee3i giao') {
                throw new Error('Task không ở trạng thái chờ giao')
            }

            // Atomic update with version check
            const updated = await tx.task.updateMany({
                where: {
                    id: taskId,
                    version: task.version,
                    assigneeId: null
                },
                data: {
                    assigneeId: userId,
                    status: 'Nh\u1eadn task', // "Nhận task"
                    claimSource: 'MARKET',
                    claimedAt: new Date(),
                    isPenalized: false,
                    version: { increment: 1 }
                }
            })

            if (updated.count === 0) {
                throw new Error('Task đã được nhận bởi người khác (race condition)')
            }

            return { success: true }
        })

        // Revalidate paths
        const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
        paths.forEach(p => revalidatePath(p))

        return result
    } catch (e: any) {
        return { error: e.message || 'Không thể nhận task' }
    }
}

// ─── Return a claimed task (within 10 minutes) ───────────────
export async function returnTask(taskId: string, workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const userId = session.user.id
    const workspacePrisma = getWorkspacePrisma(workspaceId)

    const task = await workspacePrisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, assigneeId: true, claimSource: true, claimedAt: true }
    })

    if (!task) return { error: 'Task không tồn tại' }
    if (task.assigneeId !== userId) return { error: 'Bạn không phải người nhận task này' }
    if (task.claimSource !== 'MARKET') return { error: 'Chỉ có thể hoàn task nhận từ Phiên chợ' }

    // Server-side 10-minute check (source of truth)
    if (!task.claimedAt) return { error: 'Không có thông tin thời gian nhận task' }
    const minutesSinceClaim = (Date.now() - new Date(task.claimedAt).getTime()) / (1000 * 60)
    if (minutesSinceClaim > 10) {
        return { error: 'Đã quá 10 phút, không thể hoàn task' }
    }

    await workspacePrisma.task.update({
        where: { id: taskId },
        data: {
            assigneeId: null,
            status: '\u0110ang \u0111\u1ee3i giao', // "Đang đợi giao"
            claimSource: 'ADMIN', // Reset to default
            claimedAt: null,
            isPenalized: false,
            deadline: null
        }
    })

    const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
    paths.forEach(p => revalidatePath(p))

    return { success: true }
}
