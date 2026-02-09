'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth-guard'

// --- 1. DELETE TASK ---
export async function deleteTask(id: string) {
    try {
        const user = await getCurrentUser() // Guard Check

        const task = await prisma.task.findUnique({ where: { id } })
        if (!task) return { error: 'Not found' }

        // Permission Check
        if (!user.isSuperAdmin) {
            // Agency Owner chỉ được xóa task thuộc agency mình
            if (!user.isAgencyOwner || task.assignedAgencyId !== user.ownedAgencyId) {
                return { error: 'Forbidden: Bạn không có quyền xóa Task này.' }
            }
        }

        // Nhờ onDelete: Cascade trong Prisma, UserSchedule liên quan sẽ tự mất
        await prisma.task.delete({ where: { id } })

        revalidatePath('/admin')
        return { success: true }
    } catch (e: any) {
        return { error: e.message || 'Error deleting task' }
    }
}

// --- 2. GENERIC UPDATE (Chống Hack) ---
export async function updateTask(id: string, data: any) {
    try {
        const user = await getCurrentUser() // Guard Check
        const task = await prisma.task.findUnique({ where: { id } })

        if (!task) return { error: 'Not found' }

        // Security & Sanitization
        if (!user.isSuperAdmin) {
            // Check Ownership
            if (user.isAgencyOwner && task.assignedAgencyId !== user.ownedAgencyId) return { error: 'Forbidden' }
            if (!user.isAgencyOwner && task.assigneeId !== user.id) return { error: 'Forbidden' }

            // SANITIZE: Loại bỏ trường nhạy cảm để nhân viên không tự hack lương/deadline
            delete data.wageVND
            delete data.deadline
            delete data.assigneeId
            delete data.assignedAgencyId
            delete data.isPenalized
        }

        await prisma.task.update({ where: { id }, data })

        revalidatePath('/admin')
        return { success: true }
    } catch (e: any) {
        return { error: 'Failed to update' }
    }
}

// --- 3. ASSIGN TASK (Core Logic) ---
export async function assignTask(taskId: string, assignmentId: string | null) {
    try {
        // A. AUTH & SCOPE CHECK
        const user = await getCurrentUser()
        const task = await prisma.task.findUnique({ where: { id: taskId } })

        if (!task) return { error: 'Task not found' }

        if (!user.isSuperAdmin) {
            if (!user.isAgencyOwner) return { error: 'Permission denied: Chỉ Admin/Owner mới được giao việc.' }
            if (task.assignedAgencyId !== user.ownedAgencyId) return { error: 'Task không thuộc Agency của bạn.' }

            // Validate Target User/Agency
            if (assignmentId) {
                if (assignmentId.startsWith('agency:')) return { error: 'Không thể chuyển Task sang Agency khác.' }

                const targetUser = await prisma.user.findUnique({ where: { id: assignmentId } })
                if (targetUser?.agencyId !== user.ownedAgencyId) return { error: 'Không thể giao cho nhân viên ngoài Agency.' }
            }
        }

        // B. PREPARE DATA & TIMER LOGIC (Fix Time Leak)
        let updateData: any = {}

        // Nếu task đang chạy mà bị giao lại -> Cộng dồn giờ ngay lập tức
        let newAccumulated = task.accumulatedSeconds || 0
        if (task.timerStatus === 'RUNNING' && task.timerStartedAt) {
            const now = new Date()
            const elapsed = Math.floor((now.getTime() - task.timerStartedAt.getTime()) / 1000)
            newAccumulated += elapsed
        }

        if (!assignmentId || assignmentId === 'unassigned') {
            // CASE: UNASSIGN MEMBER (Hủy giao User, giữ lại Agency)
            updateData = {
                assigneeId: null,
                // assignedAgencyId: NO CHANGE (Keep it with the agency)
                status: 'Đang đợi giao',
                isPenalized: false,
                deadline: null,
                timerStatus: 'PAUSED',
                timerStartedAt: null,
                accumulatedSeconds: newAccumulated
            }
        }
        else if (assignmentId === 'sys:revoke') {
            // CASE: REVOKE TO SYSTEM (Thu hồi hoàn toàn)
            updateData = {
                assigneeId: null,
                assignedAgencyId: null,
                status: 'Đang đợi giao',
                isPenalized: false,
                deadline: null,
                timerStatus: 'PAUSED',
                timerStartedAt: null,
                accumulatedSeconds: newAccumulated
            }
        }
        else if (assignmentId.startsWith('agency:')) {
            // CASE: ASSIGN TO AGENCY
            updateData = {
                assignedAgencyId: assignmentId.split(':')[1],
                assigneeId: null,
                status: 'Đang đợi giao',
                timerStatus: 'PAUSED',
                accumulatedSeconds: newAccumulated
            }
        }
        else {
            // CASE: ASSIGN TO USER
            // 1. Check Availability (Nếu không phải Super Admin)
            if (!user.isSuperAdmin) {
                const { checkUserAvailability } = await import('@/actions/schedule-actions')
                const availability = await checkUserAvailability(assignmentId, new Date())
                if (!availability.available) return { error: 'Nhân sự đang bận trong khung giờ này.' }
            }

            const targetUser = await prisma.user.findUnique({
                where: { id: assignmentId },
                select: { agencyId: true }
            })

            updateData = {
                assigneeId: assignmentId,
                assignedAgencyId: targetUser?.agencyId || null,
                status: 'Đã nhận task',
                isPenalized: false,
                timerStatus: 'PAUSED', // Reset về Pause để user mới tự bấm Start
                accumulatedSeconds: newAccumulated
            }
        }

        // C. EXECUTE DB UPDATE
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: { assignee: true }
        })

        // D. SIDE EFFECTS (Email & Schedule)
        if (assignmentId && updatedTask.assignee && !assignmentId.startsWith('agency:')) {

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

            // 2. Auto-Schedule (Fix Duplicate)
            if (updatedTask.deadline) {
                const end = new Date(updatedTask.deadline)
                if (end > new Date()) {
                    const start = new Date(end)
                    start.setHours(start.getHours() - 2) // Mặc định 2 tiếng

                    try {
                        // QUAN TRỌNG: Xóa lịch cũ dựa trên taskId
                        await prisma.userSchedule.deleteMany({
                            where: { taskId: taskId }
                        })

                        // Tạo lịch mới
                        await prisma.userSchedule.create({
                            data: {
                                userId: assignmentId,
                                startTime: start,
                                endTime: end,
                                type: 'TASK',
                                note: `Task: ${updatedTask.title}`,
                                taskId: taskId // Link cứng với Task
                            }
                        })
                    } catch (schedErr) {
                        console.error("Auto-schedule failed:", schedErr)
                    }
                }
            }
        } else if (!assignmentId) {
            // Nếu Unassign -> Xóa lịch cũ của task này
            await prisma.userSchedule.deleteMany({ where: { taskId: taskId } })
        }

        // E. REVALIDATE
        const paths = ['/admin', '/dashboard', '/agency', '/admin/queue']
        paths.forEach(p => revalidatePath(p))

        return { success: true }

    } catch (e: any) {
        console.error("Assign Task Error:", e)
        return { error: e.message || 'Failed to assign task' }
    }
}
