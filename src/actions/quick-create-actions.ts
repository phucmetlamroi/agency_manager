'use server'

/**
 * [Quick Create] Server action for batch creating tasks with per-task pricing.
 *
 * Different from `createBatchTasks` (bulk-task-actions.ts):
 *   - createBatchTasks: shared jobPriceUSD/wageVND across all tasks
 *   - createQuickTasks: per-task pricing (each task has its own price calculated
 *     from the pricing rule applied to its video duration)
 *
 * Used by the Quick Create wizard after the user has reviewed the auto-priced
 * preview table and clicked "Tạo N tasks".
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'
import { verifyWorkspaceAccess } from '@/lib/security'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { ensureWorkspaceMembership } from '@/lib/workspace-membership'
import { audit } from '@/lib/audit-log'

export interface QuickTaskInput {
    /** Task title (typically the video filename without extension) */
    title: string
    /** "Short form" | "Long form" | "Trial" */
    type: string
    /** USD price for this specific task (from pricing rule × duration) */
    jobPriceUSD: number
    /** VND wage for editor (from pricing rule × duration) */
    wageVND: number
    /** Original footage link (preview URL of the video file at the provider) */
    resources: string | null
    /** Optional: editor delivery link — typically null at creation time */
    productLink: string | null
    /** Optional: video duration in seconds — stored for analytics */
    durationSeconds?: number | null
}

export interface QuickCreateBatchInput {
    /** Per-task data (one entry per video the admin selected) */
    tasks: QuickTaskInput[]
    /** Common to all: client this batch is for */
    clientId: number | null
    /** Common to all: assignee (round-robin handled client-side before submit) */
    assigneeId: string | null
    /** Common to all: deadline (uniform across batch if set) */
    deadline: string | null
    /** Exchange rate snapshot at creation time (USD → VND) */
    exchangeRate: number
    /** Optional notes inherited from previous workspace */
    notes: string | null
    /** Optional EN notes */
    notes_en: string | null
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Action                                                             */
/* ──────────────────────────────────────────────────────────────────── */

export async function createQuickTasks(
    data: QuickCreateBatchInput,
    workspaceId: string,
) {
    try {
        if (!data.tasks || data.tasks.length === 0) {
            return { error: 'Danh sách task trống.' }
        }
        if (data.tasks.length > 500) {
            return { error: 'Quá nhiều task — giới hạn 500/batch.' }
        }

        // Validate financials per task
        for (const t of data.tasks) {
            if (!t.title?.trim()) {
                return { error: 'Có task tiêu đề rỗng.' }
            }
            if (!Number.isFinite(t.jobPriceUSD) || t.jobPriceUSD < 0) {
                return { error: `Task "${t.title}": jobPriceUSD không hợp lệ.` }
            }
            if (!Number.isFinite(t.wageVND) || t.wageVND < 0) {
                return { error: `Task "${t.title}": wageVND không hợp lệ.` }
            }
        }
        if (!Number.isFinite(data.exchangeRate) || data.exchangeRate <= 0) {
            return { error: 'Exchange rate không hợp lệ.' }
        }

        // Verify ADMIN access + capture user/profile info
        const { user, session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (user as any)?.sessionProfileId

        if (!workspaceId || workspaceId.trim() === '') {
            return { error: 'Lỗi nội bộ: workspaceId thiếu.' }
        }
        if (!profileId || typeof profileId !== 'string') {
            return { error: 'Lỗi nội bộ: profileId thiếu — vui lòng chọn lại profile.' }
        }

        const deadlineDate = data.deadline ? parseVietnamDate(data.deadline) : null
        const assignedById = session?.user?.id ?? null
        const status = data.assigneeId ? 'Nhận task' : 'Đang đợi giao'

        // Ensure assignee is a workspace member (if assigned)
        if (data.assigneeId) {
            await ensureWorkspaceMembership(data.assigneeId, workspaceId, 'MEMBER')
        }

        // Create all tasks in a single transaction
        const createdTasks: { id: string; title: string }[] = []
        await prisma.$transaction(async (tx) => {
            for (const t of data.tasks) {
                const revenueVND = t.jobPriceUSD * data.exchangeRate
                const profitVND = revenueVND - t.wageVND
                const task = await tx.task.create({
                    data: {
                        title: t.title.trim(),
                        value: t.wageVND,
                        type: t.type,
                        deadline: deadlineDate,
                        resources: t.resources,
                        notes_vi: data.notes,
                        notes_en: data.notes_en,
                        productLink: t.productLink,
                        assigneeId: data.assigneeId,
                        status,
                        jobPriceUSD: t.jobPriceUSD,
                        wageVND: t.wageVND,
                        exchangeRate: data.exchangeRate,
                        profitVND,
                        clientId: data.clientId,
                        workspaceId,
                        profileId,
                        assignedById,
                    },
                })
                createdTasks.push({ id: task.id, title: task.title })
            }
        })

        // Audit: 1 bulk-level entry + 1 per-task entry for forensics
        if (assignedById) {
            void audit({
                workspaceId,
                actorUserId: assignedById,
                action: 'task.bulk_updated',
                targetType: 'Task',
                targetId: null,
                after: {
                    source: 'quick_create',
                    count: createdTasks.length,
                    clientId: data.clientId,
                    assigneeId: data.assigneeId,
                },
            })
            for (const t of createdTasks) {
                void audit({
                    workspaceId,
                    actorUserId: assignedById,
                    action: 'task.assigned',
                    targetType: 'Task',
                    targetId: t.id,
                    after: { title: t.title, assigneeId: data.assigneeId, status },
                })
            }
        }

        // Fire-and-forget notifications to assignee (one per task)
        if (data.assigneeId && createdTasks.length > 0 && assignedById) {
            const actor = await prisma.user
                .findUnique({
                    where: { id: assignedById },
                    select: { username: true, nickname: true, avatarUrl: true },
                })
                .catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Admin'

            void (async () => {
                for (const t of createdTasks) {
                    try {
                        const notif = await createNotificationInternal({
                            userId: data.assigneeId!,
                            type: 'TASK_ASSIGNED',
                            title: 'New task assigned',
                            body: `${actorName} assigned you "${t.title}"`,
                            avatarUrl: actor?.avatarUrl,
                            taskId: t.id,
                            actorId: assignedById,
                            metadata: { taskTitle: t.title, source: 'quick_create' },
                        })
                        void broadcastNotificationToUser(data.assigneeId!, {
                            id: notif.id,
                            type: notif.type,
                            title: notif.title,
                            body: notif.body,
                            avatarUrl: notif.avatarUrl,
                            conversationId: notif.conversationId,
                            messageId: notif.messageId,
                            taskId: notif.taskId,
                            actorId: notif.actorId,
                            metadata: notif.metadata,
                            createdAt: notif.createdAt.toISOString(),
                            isRead: false,
                        })
                    } catch (err) {
                        console.error(`[createQuickTasks] notify error for ${t.id}:`, err)
                    }
                }
            })()
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`)

        return { success: true, count: createdTasks.length, taskIds: createdTasks.map((t) => t.id) }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới có quyền tạo task hàng loạt.' }
        }
        console.error('[createQuickTasks]', err)
        return { error: err?.message ?? 'Lỗi khi tạo task hàng loạt.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Helper: get round-robin assignee suggestion                        */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * [Quick Create] Suggest the editor with the lowest current workload in this
 * workspace. Used by the "Gán editor tự động" toggle.
 */
export async function suggestRoundRobinAssignee(workspaceId: string): Promise<
    { userId: string; username: string; nickname: string | null; activeCount: number } | null
> {
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Get all workspace members with role MEMBER (editors)
        const members = await prisma.workspaceMember.findMany({
            where: { workspaceId, role: 'MEMBER' },
            select: {
                userId: true,
                user: { select: { id: true, username: true, nickname: true } },
            },
        })

        if (members.length === 0) return null

        // Count each member's active (non-completed) task load
        const counts = await Promise.all(
            members.map(async (m) => {
                const count = await prisma.task.count({
                    where: {
                        workspaceId,
                        assigneeId: m.userId,
                        status: { notIn: ['Hoàn tất', 'Đã hủy'] },
                    },
                })
                return {
                    userId: m.userId,
                    username: m.user?.username ?? '',
                    nickname: m.user?.nickname ?? null,
                    activeCount: count,
                }
            }),
        )

        // Pick the one with lowest active count
        counts.sort((a, b) => a.activeCount - b.activeCount)
        return counts[0]
    } catch (err) {
        console.error('[suggestRoundRobinAssignee]', err)
        return null
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Helper: inherit notes from previous workspace                      */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * [Quick Create] Find notes from the most recent task for the same client in
 * a previous workspace (same profile). Used by "Kế thừa ghi chú tháng trước".
 *
 * Returns the most recent task's notes_vi + references + notes_en.
 */
export async function getPreviousWorkspaceNotes(
    workspaceId: string,
    clientId: number,
): Promise<{ notes: string | null; notes_en: string | null; references: string | null } | null> {
    try {
        const { user } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (user as any)?.sessionProfileId
        if (!profileId) return null

        // Find previous workspace (same profile, older than current)
        const currentWs = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { createdAt: true },
        })
        if (!currentWs) return null

        const previousWs = await prisma.workspace.findFirst({
            where: {
                profileId,
                createdAt: { lt: currentWs.createdAt },
                status: 'ACTIVE',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        })
        if (!previousWs) return null

        // Most recent task for this client in that workspace
        const previousTask = await prisma.task.findFirst({
            where: {
                workspaceId: previousWs.id,
                clientId,
                isArchived: false,
            },
            orderBy: { createdAt: 'desc' },
            select: { notes_vi: true, notes_en: true, references: true },
        })

        return previousTask
            ? {
                  notes: previousTask.notes_vi,
                  notes_en: previousTask.notes_en,
                  references: previousTask.references,
              }
            : null
    } catch (err) {
        console.error('[getPreviousWorkspaceNotes]', err)
        return null
    }
}
