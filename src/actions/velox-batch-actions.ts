'use server'

/**
 * [Velox v1.0 — Phase 2] Server action for creating tasks from the Batch Table
 * (BatchTaskTable.tsx). Each row carries its own clientId / type / price /
 * assignee / deadline / notes / rawFootage — unlike createQuickTasks which
 * has uniform common fields.
 *
 * Differences from createQuickTasks:
 *   - Every field is per-row (no shared clientId, etc.)
 *   - Optional skipInvalid mode: rows failing validation are silently dropped,
 *     valid rows still create. Returns per-row error map for UI to highlight.
 *
 * Permission: admin-gated via verifyWorkspaceAccess('ADMIN').
 *
 * Pattern mirrors createQuickTasks (transaction + per-task notify + audit).
 */

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'
import { verifyWorkspaceAccess } from '@/lib/security'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { ensureWorkspaceMembership, isAssigneeInWorkspaceProfile } from '@/lib/workspace-membership'
import { audit } from '@/lib/audit-log'

/* ──────────────────────────────────────────────────────────────────── */
/*  Input shape — one entry per row in the Batch Table                  */
/* ──────────────────────────────────────────────────────────────────── */

export interface BatchTaskRow {
    /** Task title (e.g., generated from video filename + optional prefix) */
    title: string
    /** "Short form" | "Long form" | "Trial" */
    type: string
    /** USD price for this row (from pricing rule or user override) */
    jobPriceUSD: number
    /** VND wage (editor reward) */
    wageVND: number
    /** Optional client (per-row override). null → workspace default or no client */
    clientId: number | null
    /** Optional assignee. null → task enters queue (status 'Đang đợi giao') */
    assigneeId: string | null
    /** ISO date string ("YYYY-MM-DDTHH:mm") or null */
    deadline: string | null
    /** Original footage link → stored in `resources` */
    rawFootage: string | null
    /** [QA R1 fix] Collect-files link → stored in `collectFilesLink`. Was missing,
     *  so the "Collect file" link entered in the UI was silently dropped on every
     *  Velox batch create. */
    collectFilesLink?: string | null
    /** Packed references string ("REF:url | SCRIPT:url") → stored in `references` */
    references?: string | null
    /** Per-row notes (notes_vi). null → empty */
    notes: string | null
}

export interface CreateTasksFromBatchInput {
    /** Per-row data — one row = one task */
    rows: BatchTaskRow[]
    /** Exchange rate snapshot at create time (USD → VND) */
    exchangeRate: number
    /** If true, rows failing validation are skipped (still create valid rows).
     *  If false, any invalid row aborts the entire batch. */
    skipInvalid?: boolean
}

export interface CreateTasksFromBatchResult {
    success: true
    /** Count of tasks successfully created */
    count: number
    /** IDs of created tasks (for caller to navigate / refresh UI) */
    taskIds: string[]
    /** When skipInvalid=true, rows that failed validation with the reason.
     *  Empty array when all rows were valid. */
    skipped: Array<{ rowIndex: number; title: string; reason: string }>
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Per-row validation                                                  */
/* ──────────────────────────────────────────────────────────────────── */

function validateRow(row: BatchTaskRow, index: number): string | null {
    if (!row.title?.trim()) return `Row ${index + 1}: tiêu đề rỗng`
    if (!Number.isFinite(row.jobPriceUSD) || row.jobPriceUSD < 0) {
        return `Row ${index + 1} ("${row.title}"): jobPriceUSD không hợp lệ`
    }
    if (!Number.isFinite(row.wageVND) || row.wageVND < 0) {
        return `Row ${index + 1} ("${row.title}"): wageVND không hợp lệ`
    }
    if (!row.type?.trim()) return `Row ${index + 1} ("${row.title}"): thiếu type`
    return null
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Action                                                              */
/* ──────────────────────────────────────────────────────────────────── */

export async function createTasksFromBatch(
    data: CreateTasksFromBatchInput,
    workspaceId: string,
): Promise<CreateTasksFromBatchResult | { error: string }> {
    try {
        if (!data.rows || data.rows.length === 0) {
            return { error: 'Danh sách row trống.' }
        }
        if (data.rows.length > 500) {
            return { error: 'Quá nhiều row — giới hạn 500/batch.' }
        }
        if (!Number.isFinite(data.exchangeRate) || data.exchangeRate <= 0) {
            return { error: 'Exchange rate không hợp lệ.' }
        }

        // Per-row validation pass
        const validRows: Array<{ row: BatchTaskRow; originalIndex: number }> = []
        const skipped: CreateTasksFromBatchResult['skipped'] = []
        for (let i = 0; i < data.rows.length; i++) {
            const row = data.rows[i]
            const err = validateRow(row, i)
            if (err) {
                if (data.skipInvalid) {
                    skipped.push({ rowIndex: i, title: row.title || '(no title)', reason: err })
                    continue
                }
                return { error: err }
            }
            validRows.push({ row, originalIndex: i })
        }

        if (validRows.length === 0) {
            return { error: 'Không có row nào hợp lệ.' }
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

        const assignedById = session?.user?.id ?? null

        // Ensure every unique assignee is a workspace member (best-effort, fire-and-forget
        // is too risky — if membership fails, task creation FK might fail too)
        const uniqueAssignees = Array.from(
            new Set(validRows.map((r) => r.row.assigneeId).filter((a): a is string => !!a)),
        )

        // [Bug 2026-06-10] Pre-validate every unique assigneeId exists in the
        // User table before opening the transaction. Without this, an orphan
        // userId (stale Velox draft, deleted user) would silently fail
        // ensureWorkspaceMembership, then explode inside the transaction with
        // "Foreign key constraint violated: Task_assigneeId_fkey" and roll
        // back ALL valid rows. Better to refuse the whole batch up front
        // with a clear Vietnamese message than to crash the user mid-flow.
        if (uniqueAssignees.length > 0) {
            const existingUsers = await prisma.user.findMany({
                where: { id: { in: uniqueAssignees } },
                select: { id: true },
            })
            const existingIds = new Set(existingUsers.map((u) => u.id))
            const missing = uniqueAssignees.filter((id) => !existingIds.has(id))
            if (missing.length > 0) {
                console.error('[createTasksFromBatch] BLOCK: orphan assigneeId(s)', { missing, workspaceId })
                return {
                    error:
                        `Có ${missing.length} editor được gán không còn tồn tại trong hệ thống ` +
                        `(có thể đã bị xoá hoặc workspace đã được clone). ` +
                        `Vui lòng bỏ chọn assignee các row đó (Leave Blank) hoặc chọn editor khác rồi thử lại.`,
                }
            }
        }

        // [AUDIT R14 — fix] Each assignee must already belong to THIS workspace's profile —
        // reject foreign-tenant userIds before ensureWorkspaceMembership provisions them
        // (it upserts a ProfileAccess for any global id, a cross-tenant injection primitive).
        for (const assigneeId of uniqueAssignees) {
            const ok = await isAssigneeInWorkspaceProfile(assigneeId, workspaceId, profileId)
            if (!ok) {
                return { error: 'Có editor được gán không thuộc workspace/profile này. Hãy mời họ vào workspace trước khi giao việc.' }
            }
        }

        // [AUDIT R14 — fix] Every per-row clientId must belong to THIS profile — a foreign
        // numeric clientId would otherwise attach and surface another profile's client name.
        const uniqueClientIds = Array.from(
            new Set(validRows.map((r) => r.row.clientId).filter((c): c is number => c != null)),
        )
        if (uniqueClientIds.length > 0) {
            const validClients = await prisma.client.findMany({
                where: { id: { in: uniqueClientIds }, profileId },
                select: { id: true },
            })
            if (validClients.length !== uniqueClientIds.length) {
                return { error: 'Có khách hàng được chọn không hợp lệ (không thuộc profile này).' }
            }
        }

        for (const assigneeId of uniqueAssignees) {
            await ensureWorkspaceMembership(assigneeId, workspaceId, 'MEMBER')
        }

        // Create tasks in a single transaction (atomic — all or nothing)
        const createdTasks: { id: string; title: string; assigneeId: string | null }[] = []
        await prisma.$transaction(async (tx) => {
            for (const { row } of validRows) {
                const revenueVND = row.jobPriceUSD * data.exchangeRate
                const profitVND = revenueVND - row.wageVND
                const deadlineDate = row.deadline ? parseVietnamDate(row.deadline) : null
                const status = row.assigneeId ? 'Nhận task' : 'Đang đợi giao'

                const task = await tx.task.create({
                    data: {
                        title: row.title.trim(),
                        value: row.wageVND,
                        type: row.type,
                        deadline: deadlineDate,
                        resources: row.rawFootage,
                        collectFilesLink: row.collectFilesLink ?? null,
                        references: row.references ?? null,
                        notes_vi: row.notes,
                        notes_en: null,
                        productLink: null,
                        // [Velox blank-assignee fix] Coalesce '' → null at the INSERT sink. When a
                        // user picks "Leave Blank (Task Pool)" the form assigneeId is the empty
                        // string '' (AutocompleteInput emptyLabel → onSelect('')); the V3 path keeps
                        // it via `??`, and '' is NOT null, so a raw insert trips Task_assigneeId_fkey.
                        // The pre-validation above filters '' out (treats it as blank) so it never
                        // caught this. Normalizing here covers BOTH the V1 and V3 batch sources.
                        assigneeId: row.assigneeId || null,
                        status,
                        jobPriceUSD: row.jobPriceUSD,
                        wageVND: row.wageVND,
                        exchangeRate: data.exchangeRate,
                        profitVND,
                        clientId: row.clientId,
                        workspaceId,
                        profileId,
                        assignedById,
                    },
                })
                createdTasks.push({ id: task.id, title: task.title, assigneeId: row.assigneeId })
            }
        })

        // Audit log: 1 bulk-level entry + 1 per-task entry
        if (assignedById) {
            void audit({
                workspaceId,
                actorUserId: assignedById,
                action: 'task.bulk_updated',
                targetType: 'Task',
                targetId: null,
                after: {
                    source: 'velox_batch',
                    count: createdTasks.length,
                    skippedCount: skipped.length,
                },
            })
            for (const t of createdTasks) {
                void audit({
                    workspaceId,
                    actorUserId: assignedById,
                    action: 'task.assigned',
                    targetType: 'Task',
                    targetId: t.id,
                    after: { title: t.title, assigneeId: t.assigneeId },
                })
            }
        }

        // Fire-and-forget per-assignee notifications
        if (createdTasks.length > 0 && assignedById) {
            const actor = await prisma.user
                .findUnique({
                    where: { id: assignedById },
                    select: { username: true, nickname: true, avatarUrl: true },
                })
                .catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Admin'

            void (async () => {
                for (const t of createdTasks) {
                    if (!t.assigneeId) continue // skip queue items
                    try {
                        const notif = await createNotificationInternal({
                            userId: t.assigneeId,
                            type: 'TASK_ASSIGNED',
                            title: 'New task assigned',
                            body: `${actorName} assigned you "${t.title}"`,
                            avatarUrl: actor?.avatarUrl,
                            taskId: t.id,
                            actorId: assignedById,
                            metadata: { taskTitle: t.title, source: 'velox_batch' },
                        })
                        void broadcastNotificationToUser(t.assigneeId, {
                            id: notif.id,
                            type: notif.type,
                            title: notif.title,
                            body: notif.body,
                            avatarUrl: notif.avatarUrl,
                            taskId: notif.taskId,
                            actorId: notif.actorId,
                            metadata: notif.metadata,
                            createdAt: notif.createdAt.toISOString(),
                            isRead: false,
                        })
                    } catch (err) {
                        console.error(`[createTasksFromBatch] notify error for ${t.id}:`, err)
                    }
                }
            })()
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`)

        return {
            success: true,
            count: createdTasks.length,
            taskIds: createdTasks.map((t) => t.id),
            skipped,
        }
    } catch (err: any) {
        if (err?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: 'Chỉ admin mới có quyền tạo task hàng loạt.' }
        }
        console.error('[createTasksFromBatch]', err)
        return { error: err?.message ?? 'Lỗi khi tạo task hàng loạt.' }
    }
}
