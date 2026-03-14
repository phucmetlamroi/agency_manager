'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

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

        // Nhờ onDelete: Cascade trong Prisma, UserSchedule liên quan sẽ tự mất
        await workspacePrisma.task.delete({ where: { id } })

        revalidatePath(`/${workspaceId}/admin`)
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
            // CASE: UNASSIGN MEMBER (Hủy giao User)
            updateData = {
                assigneeId: null,
                assignedAgencyId: null,
                status: 'Đang đợi giao',
                isPenalized: false,
                deadline: null
            }
        }
        else if (assignmentId === 'sys:revoke') {
            // CASE: REVOKE TO SYSTEM (Thu hồi hoàn toàn)
            updateData = {
                assigneeId: null,
                assignedAgencyId: null,
                status: 'Đang đợi giao',
                isPenalized: false,
                deadline: null
            }
        }

        else {
            // CASE: ASSIGN TO USER
            // 1. Check Availability (Nếu không phải Super Admin)
            // Assigned without schedule constraint

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
                status: 'Đã nhận task',
                isPenalized: false
            }
        }

        // C. EXECUTE DB UPDATE
        const updatedTask = await workspacePrisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: { assignee: true }
        })

        // D. SIDE EFFECTS (Email & Schedule)
        if (assignmentId && updatedTask.assignee) {

            // 1. Gửi Email (Fire-and-forget, không await để tránh lag UI)
            if (updatedTask.assignee.email) {
                const { sendEmail } = await import('@/lib/email')
                const { emailTemplates } = await import('@/lib/email-templates')

                sendEmail({
                    to: updatedTask.assignee.email,
                    subject: `[New Task] ${updatedTask.title}`,
                    html: emailTemplates.taskAssigned(
                        updatedTask.assignee.username || 'User',
                        updatedTask.title,
                        updatedTask.deadline,
                        updatedTask.id
                    )
                }).catch(err => console.error("[Email Error] Background send failed:", err));
            }
        }

        // E. REVALIDATE
        const paths = [`/${workspaceId}/admin`, `/${workspaceId}/dashboard`, `/${workspaceId}/admin/queue`]
        paths.forEach(p => revalidatePath(p))

        return { success: true }

    } catch (e: any) {
        console.error("Assign Task Error:", e)
        return { error: e.message || 'Failed to assign task' }
    }
}
