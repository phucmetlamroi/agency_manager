'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function checkOverdueTasks() {
    try {
        const now = new Date()

        // Find tasks that are overdue, not completed, and haven't been penalized yet
        const overdueTasks = await prisma.task.findMany({
            where: {
                deadline: { lt: now }, // Deadline has passed
                status: { notIn: ['Hoàn tất'] }, // Not done
                isPenalized: false, // Not yet penalized
                assigneeId: { not: null } // Must be assigned
            },
            include: {
                assignee: true
            }
        })

        const notifications = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // 1. Deduct 10 points
            const currentRep = task.assignee.reputation || 100
            const newRep = currentRep - 10

            // 2. Check Lock Condition
            let newRole = task.assignee.role
            let statusMsg = 'Bình thường'

            if (newRep <= 0) {
                newRole = 'LOCKED' // You might need to handle this role in your Auth/Guard
                statusMsg = 'Đã xóa (LOCKED)'
            } else if (newRep < 50) {
                statusMsg = 'Cảnh báo'
            }

            // 3. Auto-Recall Logic (Return to Queue)
            // Reset assignee and status so it appears in "Kho Task" (Queue)
            // But we keep "isPenalized: true" to avoid double punishment if picked up again? 
            // Actually, if picked up again, it's a new cycle. But 'isPenalized' triggers logic.
            // If we reset Assignee, the task is now "Free". 
            // The penalty was for the *Previous* user. 
            // We should probably log this event or just reset 'isPenalized' to false for the NEXT user?
            // If we reset 'isPenalized' to false, next user might deal with short deadline?
            // Usually Admin will reset deadline or logic handles it.
            // Let's keep isPenalized=true on this task to mark it as "tainted" or just for history.
            // Requirement: "về mục Kho task" -> assigneeId = null.

            await prisma.$transaction([
                prisma.user.update({
                    where: { id: task.assignee.id },
                    data: {
                        reputation: newRep,
                        role: newRole
                    }
                }),
                prisma.task.update({
                    where: { id: task.id },
                    data: {
                        isPenalized: true,
                        assigneeId: null, // Kick user
                        status: 'Đang đợi giao' // Reset status to specific "Waiting" state
                    }
                }),
                prisma.notification.create({
                    data: {
                        message: `THU HỒI TASK: "${task.title}" từ @${task.assignee.username} do quá hạn. (Đã trừ 10đ)`,
                        type: 'WARNING',
                        userId: null // Broadcast to Admin
                    }
                })
            ])

            // 4. Prepare Notification (Legacy return, keeping for compatibility if utilized elsewhere)
            notifications.push({
                editor: task.assignee.username,
                score: `${newRep}/100 (-10)`,
                reason: `Trễ Task [${task.title}] - ĐÃ THU HỒI`,
                status: statusMsg,
                taskId: task.id
            })
        }

        if (notifications.length > 0) {
            revalidatePath('/admin')
            revalidatePath('/dashboard')
        }

        return { success: true, notifications }

    } catch (error) {
        console.error("Error checking overdue tasks:", error)
        return { error: 'Failed' }
    }
}
