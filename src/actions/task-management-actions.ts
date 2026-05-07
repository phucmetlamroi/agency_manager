'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'

// --- 1. DELETE TASK ---
export async function deleteTask(id: string, workspaceId: string) {
    try {
        const user = await getCurrentUser() // Guard Check
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        const task = await workspacePrisma.task.findUnique({ where: { id } })
        if (!task) return { error: 'Not found' }

        // Permission Check
        if (!user.isSuperAdmin) {
            return { error: 'Forbidden: Bạn không có quyền xóa Task này.' }
        }

        await workspacePrisma.task.delete({ where: { id } })

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Error deleting task' }
    }
}

// --- 2. GENERIC UPDATE (Chống Hack) ---
export async function updateTask(id: string, data: any, workspaceId: string) {
    try {
        const user = await getCurrentUser() // Guard Check
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const task = await workspacePrisma.task.findUnique({ where: { id } })

        if (!task) return { error: 'Not found' }

        // Security & Sanitization
        if (!user.isSuperAdmin) {
            // Check Ownership
            if (task.assigneeId !== user.id) return { error: 'Forbidden' }

            // SANITIZE: Loại bỏ trường nhạy cảm để nhân viên không tự hack lương/deadline
            delete data.wageVND
            delete data.deadline
            delete data.assigneeId
            delete data.assignedAgencyId
            delete data.isPenalized
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
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const task = await workspacePrisma.task.findUnique({ where: { id: taskId } })

        if (!task) return { error: 'Task not found' }

        if (!user.isSuperAdmin) {
            return { error: 'Permission denied: Chỉ Admin mới được giao việc.' }
        }

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
                conversationId: notif.conversationId,
                messageId: notif.messageId,
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
                conversationId: notif.conversationId,
                messageId: notif.messageId,
                taskId: notif.taskId,
                actorId: notif.actorId,
                metadata: notif.metadata,
                createdAt: notif.createdAt.toISOString(),
                isRead: false,
            })
        } catch {/* swallow */}
    }
}
