'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function checkOverdueTasks() {
    try {
        const now = new Date()

        // Find tasks that are overdue, not completed, and are STILL assigned
        // Note: We removed 'isPenalized: false' to catch "stuck" tasks that were penalized but not successfully recalled.
        const overdueTasks = await prisma.task.findMany({
            where: {
                deadline: { lt: now }, // Deadline has passed
                status: { notIn: ['Hoàn tất'] }, // Not done
                assigneeId: { not: null }, // Must be assigned
                // Safety: Do not penalize tasks created in the last 15 minutes (grace period for wrong entry)
                createdAt: { lt: new Date(now.getTime() - 15 * 60 * 1000) }
            },
            include: {
                assignee: true
            }
        })

        const notifications = []

        for (const task of overdueTasks) {
            if (!task.assignee) continue

            // Determine if valid for penalty
            const isRecycle = task.isPenalized // If already true, it's a "stuck" task or double-check.

            let newRep = task.assignee.reputation || 100
            let statusMsg = 'Bình thường'
            let notifMessage = ''

            if (!isRecycle) {
                // FRESH PENALTY
                newRep = newRep - 10

                // Check Lock
                let newRole = task.assignee.role
                if (newRep <= 0) {
                    newRole = 'LOCKED'
                    statusMsg = 'Đã xóa (LOCKED)'
                } else if (newRep < 50) {
                    statusMsg = 'Cảnh báo'
                }

                await prisma.user.update({
                    where: { id: task.assignee.id },
                    data: { reputation: newRep, role: newRole }
                })

                notifMessage = `THU HỒI TASK: "${task.title}" từ @${task.assignee.username} do quá hạn. (Đã trừ 10đ)`
            } else {
                // ALREADY PENALIZED BUT STILL ASSIGNED (Stuck state cleanup)
                // Just recall, no double penalty.
                notifMessage = `THU HỒI LẠI TASK: "${task.title}" từ @${task.assignee.username} (Đã phạt trước đó)`
            }

            // Common Recall Logic
            await prisma.$transaction([
                prisma.task.update({
                    where: { id: task.id },
                    data: {
                        isPenalized: true, // Ensure it's marked
                        assigneeId: null, // Kick user
                        status: 'Đang đợi giao'
                    }
                }),
                prisma.notification.create({
                    data: {
                        message: notifMessage,
                        type: 'WARNING',
                        userId: null
                    }
                })
            ])

            notifications.push({
                editor: task.assignee.username,
                score: isRecycle ? 'No Change' : `${newRep}/100 (-10)`,
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
