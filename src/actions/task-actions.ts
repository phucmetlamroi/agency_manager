'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTaskStatus(id: string, newStatus: string) {
    try {
        // Fetch task to check deadline and assignee
        const task = await prisma.task.findUnique({
            where: { id },
            include: { assignee: true }
        })

        if (!task) return { error: 'Task not found' }

        // Logic: Reward if Completed Early/On-Time
        if (newStatus === 'Hoàn tất' && task.status !== 'Hoàn tất' && task.deadline && task.assignee) {
            const now = new Date()
            if (now <= task.deadline) {
                // Check current reputation
                if (task.assignee.reputation < 100) {
                    // Cap at 100
                    const newRep = Math.min(task.assignee.reputation + 5, 100)
                    await prisma.user.update({
                        where: { id: task.assignee.id },
                        data: { reputation: newRep }
                    })
                }
            }
        }

        // Logic: Clear deadline if 'Revision', 'Sửa frame', 'Tạm ngưng'
        const restrictedStatuses = ['Revision', 'Sửa frame', 'Tạm ngưng']
        // Existing Deadline clear logic
        const deadlineUpdate = restrictedStatuses.includes(newStatus) ? { deadline: null } : {}

        // REWARD LOGIC: If completing task (This block is redundant with the one above, but added as per instruction)
        if (newStatus === 'Hoàn tất') {
            // Re-fetch task to ensure latest state if needed, though 'task' is already available
            // Using the 'task' variable already fetched at the beginning of the function
            if (task && task.assigneeId && task.deadline) {
                const now = new Date()
                const deadline = new Date(task.deadline) // Ensure deadline is a Date object

                // Check if on time (strict <=)
                if (now <= deadline) {
                    const currentRep = task.assignee?.reputation || 0 // Default to 0 if assignee or reputation is null/undefined
                    if (currentRep < 100) {
                        // Add 5 points, max 100
                        let newRep = currentRep + 5
                        if (newRep > 100) newRep = 100

                        await prisma.user.update({
                            where: { id: task.assigneeId },
                            data: { reputation: newRep }
                        })
                    }
                }
            }
        }

        await prisma.task.update({
            where: { id },
            data: {
                status: newStatus,
                ...deadlineUpdate
            }
        })
        revalidatePath('/admin')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}
