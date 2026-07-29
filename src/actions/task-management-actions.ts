'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { verifyWorkspaceAccess } from '@/lib/security'
import { sanitizeExternalUrl } from '@/lib/safe-url'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'

// --- 1. DELETE TASK ---
export async function deleteTask(id: string, workspaceId: string) {
    try {
        // [AUDIT R1 — HIGH fix #8] Was gated on the legacy GLOBAL isSuperAdmin
        // (user.role==='ADMIN'): a legacy global admin could delete tasks in ANY
        // tenant's workspace, while new-model workspace admins were blocked entirely.
        // Scope to workspace ADMIN.
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        const task = await workspacePrisma.task.findUnique({ where: { id } })
        if (!task) return { error: 'Not found' }

        await workspacePrisma.task.delete({ where: { id } })

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Error deleting task' }
    }
}

// [AUDIT HT-007 fix] ALLOWLIST — the ONLY keys updateTask may write.
//
// The previous fix blacklisted `id`/`workspaceId`/`profileId` with `delete`. That is not
// enough, and the audit's own recommendation said so: `data` reaches Prisma as an unchecked
// object, and Task carries RELATIONS (`workspace`, `profile`, `client`, `assignedBy`, …), so
// `{ workspace: { connect: { id: '<victim>' } } }` walks straight past every `delete` and
// still re-parents the task into another tenant. A blacklist can only ever block the spellings
// someone thought of; an allowlist blocks the ones they didn't.
//
// Deliberately absent for EVERYONE — each has a dedicated, gated action and none belongs on a
// "generic update": id · workspaceId · profileId · workspace · profile (tenancy / primary key)
// · version (optimistic lock) · createdAt / updatedAt (audit trail) · clientUserId (identity)
// · every relation-object form of the above.
const TASK_FIELDS_MEMBER = [
    'title',
    'type',
    'references',
    'resources',
    'notes_vi',
    'notes_en',
    'fileLink',
    'productLink',
    'duration',
    'collectFilesLink',
    'submissionFolder',
    'frameUsername',
    'framePassword',
    'frameNote',
] as const

// Admin adds scheduling + assignment + archive flags. Nothing else the CALLER can name — note
// that the invariant helpers below may still derive `status`/`deadline` from an `assigneeId`
// change; those two values are hard-coded and non-terminal, so they cannot reach payroll.
//
// Everything an admin might expect here but will NOT find has a dedicated action that enforces a
// rule this generic endpoint cannot. Routing writes through `updateTask` would silently skip them:
//   status                → updateTaskStatus (task-actions.ts:28 isValidStatus — the guard added
//                           after a junk status made a task vanish from every tab — plus the
//                           optimistic `version` check at :108 and the notify/email fan-out).
//                           NOTE: this endpoint does NOT call it and never did — it writes Prisma
//                           directly. (It skips no FSM: validateTransition is a deliberate no-op,
//                           fsm-config.ts:122. And Task has no status-history table at all.)
//   value/wageVND/…       → updateTaskDetails (update-task-details.ts:83-103): refuses to touch money
//                           once that month's Payroll is PAID, and keeps wageVND/profitVND in sync.
//   clientId/projectId/   → the create paths validate these FKs against the profile
//   assignedAgencyId/       (bulk-task-actions.ts:103-112, "AUDIT R14"). updateTask never did, so an
//   invoiceId/assignedById  admin could point a task at another tenant's client/invoice/assigner.
//   clientReview*         → share-portal-actions / review decision flow. Writing it by hand forges
//                           the client's sign-off.
// Keeping them out is the smaller and safer change: this action has NO caller in the repo, so the
// dedicated paths are already the only ones anything actually uses.
const TASK_FIELDS_ADMIN = [
    ...TASK_FIELDS_MEMBER,
    'deadline',
    'assigneeId',
    'isArchived',
    'isPenalized',
] as const

// --- 2. GENERIC UPDATE (Chống Hack) ---
export async function updateTask(id: string, input: any, workspaceId: string) {
    try {
        const user = await getCurrentUser() // Guard Check
        // [AUDIT R1 — HIGH fix #8] Scope the admin check to THIS workspace instead of
        // the legacy global isSuperAdmin flag. Members may still update their own
        // assigned task (ownership branch below); workspace ADMIN/OWNER update any.
        const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        const isWorkspaceAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN'
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const task = await workspacePrisma.task.findUnique({ where: { id } })

        if (!task) return { error: 'Not found' }

        // Check Ownership — a non-admin may only touch a task assigned to them.
        if (!isWorkspaceAdmin && task.assigneeId !== user.id) return { error: 'Forbidden' }

        // Build the write payload by COPYING allowed keys out of the caller's object. Nothing
        // the caller sends is passed through by reference, so unknown keys and relation-object
        // payloads (`{ workspace: { connect: … } }`) simply never exist downstream.
        const allowed = isWorkspaceAdmin ? TASK_FIELDS_ADMIN : TASK_FIELDS_MEMBER
        const data: Record<string, unknown> = {}
        for (const key of allowed) {
            if (input && Object.prototype.hasOwnProperty.call(input, key)) {
                data[key] = input[key]
            }
        }
        if (Object.keys(data).length === 0) return { error: 'No updatable fields provided' }

        // [AUDIT HT-031 fix] Đây là ĐƯỜNG GHI THỨ HAI vào productLink mà bộ vá XSS trước bỏ sót:
        // nhánh non-admin cho đúng editor được giao task đi qua, rồi ghi thô. `javascript:` lưu
        // được ở đây sẽ chạy trong phiên của KHÁCH khi khách bấm link trên portal.
        if (typeof data.productLink === 'string') {
            data.productLink = sanitizeExternalUrl(data.productLink)
        }

        // [AUDIT HT-007 fix] An admin may reassign, but only to someone who is actually in this
        // workspace's profile — otherwise the allowlist would still let a task be handed to an
        // outsider. Same predicate assignTask/createBatchTasks already use.
        if (data.assigneeId) {
            const { isAssigneeInWorkspaceProfile } = await import('@/lib/workspace-membership')
            const ok = await isAssigneeInWorkspaceProfile(String(data.assigneeId), workspaceId)
            if (!ok) return { error: 'Người nhận không thuộc workspace này' }
        }

        // [Z+1.fix8] Enforce assigneeId ↔ status invariant cho mọi update path.
        // task đã fetch ở line 39 → reuse, không tốn thêm query.
        if ('assigneeId' in data || 'status' in data) {
            const { enforceAssigneeStatusInvariant } = await import('@/lib/task-invariants')
            enforceAssigneeStatusInvariant(data, task)
        }

        // [Status↔Deadline] Enforce status='Revision'/'Hoàn tất' → deadline=null.
        // Reuse task fetched at line 39 — no extra query needed.
        if ('status' in data || 'deadline' in data) {
            const { enforceStatusDeadlineInvariant } = await import('@/lib/task-invariants')
            enforceStatusDeadlineInvariant(data, task)
        }

        await workspacePrisma.task.update({ where: { id }, data })

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e: any) {
        return { error: 'Failed to update' }
    }
}

// --- 3. ASSIGN TASK (Core Logic) ---
export async function assignTask(taskId: string, assignmentId: string | null, workspaceId: string) {
    try {
        // A. AUTH & SCOPE CHECK
        const user = await getCurrentUser()
        // [AUDIT R1 — HIGH fix #8] Scope assign permission to workspace ADMIN instead
        // of the legacy global isSuperAdmin flag.
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const task = await workspacePrisma.task.findUnique({ where: { id: taskId } })

        if (!task) return { error: 'Task not found' }

        // B. PREPARE DATA
        let updateData: any = {}

        if (!assignmentId || assignmentId === 'unassigned') {
            updateData = {
                assigneeId: null,
                assignedAgencyId: null,
                status: '\u0110ang \u0111\u1ee3i giao',
                isPenalized: false,
                deadline: null
            }
        }
        else if (assignmentId === 'sys:revoke') {
            // CASE: REVOKE TO SYSTEM (Thu hồi hoàn toàn)
            updateData = {
                assigneeId: null,
                assignedAgencyId: null,
                status: '\u0110ang \u0111\u1ee3i giao',
                isPenalized: false,
                deadline: null
            }
        }

        else {
            // CASE: ASSIGN TO USER
            if (assignmentId.startsWith('agency:')) {
                return { error: 'Agency assignment is no longer supported.' }
            }
            const latestRank = await workspacePrisma.monthlyRank.findFirst({
                where: { userId: assignmentId, workspaceId },
                orderBy: { createdAt: 'desc' }
            })
            if (latestRank && latestRank.rank === 'D') {
                return { error: 'Không thể giao Task: Nhân sự đang bị Phạt thẻ đỏ (Rank D).' }
            }

            // [AUDIT R14 — fix] The assignee must belong to THIS workspace's profile —
            // don't let an admin assign a task (with its wage/client data + notification)
            // to a foreign-tenant userId passed via RPC.
            const { isAssigneeInWorkspaceProfile } = await import('@/lib/workspace-membership')
            const assigneeAllowed = await isAssigneeInWorkspaceProfile(assignmentId, workspaceId)
            if (!assigneeAllowed) {
                return { error: 'Editor được chọn không thuộc workspace/profile này.' }
            }

            updateData = {
                assigneeId: assignmentId,
                assignedAgencyId: null,
                status: 'Nh\u1eadn task',
                isPenalized: false,
                claimSource: 'ADMIN',
                claimedAt: new Date()
            }
        }

        // C. EXECUTE DB UPDATE
        // Capture old assigneeId BEFORE update for unassign notification
        const oldAssigneeId = task.assigneeId

        const updatedTask = await workspacePrisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: {
                assignee: {
                    select: {
                        id: true,
                        username: true,
                        role: true,
                        nickname: true,
                        email: true
                    }
                }
            }
        })

        // D. NOTIFICATION HOOKS — fire-and-forget
        // Email is handled by the notification system (Phase N-6 templates + bypass matrix).
        // Previously a direct sendEmail call lived here too, causing DUPLICATE emails.
        // The notification system respects user prefs (mute/digest/quiet hours) while
        // TASK_ASSIGNED bypasses mute + digest, ensuring delivery.
        void notifyTaskAssignmentChange(updatedTask.id, updatedTask.title, user.id, oldAssigneeId, updateData.assigneeId)
            .catch((err) => console.error('[assignTask] notifyTaskAssignmentChange error:', err))

        // E. REVALIDATE
        const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
        paths.forEach(p => revalidatePath(p))

        return { success: true }

    } catch (e: any) {
        console.error("Assign Task Error:", e)
        return { error: e.message || 'Failed to assign task' }
    }
}

// Notify on task assignment changes
async function notifyTaskAssignmentChange(
    taskId: string,
    taskTitle: string,
    actorId: string,
    oldAssigneeId: string | null,
    newAssigneeId: string | null
) {
    if (oldAssigneeId === newAssigneeId) return

    const actor = await prisma.user.findUnique({
        where: { id: actorId },
        select: { username: true, nickname: true, avatarUrl: true },
    })
    const actorName = actor?.nickname || actor?.username || 'Admin'

    const safeTitle = taskTitle || 'Untitled task'

    // Newly assigned user
    if (newAssigneeId && newAssigneeId !== actorId) {
        try {
            const notif = await createNotificationInternal({
                userId: newAssigneeId,
                type: 'TASK_ASSIGNED',
                title: 'New task assigned',
                body: `${actorName} assigned you "${safeTitle}"`,
                avatarUrl: actor?.avatarUrl,
                taskId,
                actorId,
                metadata: { taskTitle: safeTitle },
            })
            void broadcastNotificationToUser(newAssigneeId, {
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
        } catch {/* swallow */}
    }

    // Previously-assigned user (notify of removal)
    if (oldAssigneeId && oldAssigneeId !== actorId && oldAssigneeId !== newAssigneeId) {
        try {
            const notif = await createNotificationInternal({
                userId: oldAssigneeId,
                type: 'TASK_UNASSIGNED',
                title: 'Task removed from you',
                body: `${actorName} removed "${safeTitle}" from your queue`,
                avatarUrl: actor?.avatarUrl,
                taskId,
                actorId,
                metadata: { taskTitle: safeTitle },
            })
            void broadcastNotificationToUser(oldAssigneeId, {
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
        } catch {/* swallow */}
    }
}
