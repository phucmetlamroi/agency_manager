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

            // 3. Update User & Task
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
                    data: { isPenalized: true }
                })
            ])

            // 4. Prepare Notification
            notifications.push({
                editor: task.assignee.username,
                score: `${newRep}/100 (-10)`,
                reason: `Trễ Task [${task.title}]`,
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
