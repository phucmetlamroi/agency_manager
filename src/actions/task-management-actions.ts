'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function deleteTask(id: string) {
    try {
        await prisma.task.delete({ where: { id } })
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Error deleting task' }
    }
}

// Just for changing status or re-assigning
export async function updateTask(id: string, data: any) {
    try {
        await prisma.task.update({ where: { id }, data })
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update' }
    }
}

export async function assignTask(taskId: string, userId: string | null) {
    try {
        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                assigneeId: userId || null,
                status: userId ? 'Đã nhận task' : 'Đang đợi giao',
                isPenalized: false, // Reset penalty state for new assignee
                // If unassigning (userId is null), also clear the deadline and PAUSE timer
                ...(userId ? {
                    timerStatus: 'RUNNING',
                    timerStartedAt: new Date()
                } : {
                    deadline: null,
                    timerStatus: 'PAUSED',
                    timerStartedAt: null
                })
            },
            include: { assignee: true } // Fetch assignee to get email
        })

        // TRIGGER EMAIL 1: Task Assigned
        if (userId && updatedTask.assignee && updatedTask.assignee.email) {
            const { sendEmail } = await import('@/lib/email')
            const { emailTemplates } = await import('@/lib/email-templates')

            // Fire and forget (don't await)
            void sendEmail({
                to: updatedTask.assignee.email,
                subject: `[New Task] Bạn được giao công việc mới: ${updatedTask.title}`,
                html: emailTemplates.taskAssigned(
                    updatedTask.assignee.username || 'User',
                    updatedTask.title,
                    updatedTask.deadline,
                    updatedTask.id
                )
            })
        }

        revalidatePath('/admin')
        revalidatePath('/admin/queue')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to assign task' }
    }
}
