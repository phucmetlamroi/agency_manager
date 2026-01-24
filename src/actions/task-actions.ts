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
        const deadlineUpdate = restrictedStatuses.includes(newStatus) ? { deadline: null } : {}

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
