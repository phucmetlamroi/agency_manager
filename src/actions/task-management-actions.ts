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
                    timerStatus: 'PAUSED',
                    timerStartedAt: null
                } : {
                    deadline: null,
                    timerStatus: 'PAUSED',
                    timerStartedAt: null
                })
            },
            include: { assignee: true } // Fetch assignee to get email
        })

        // TRIGGER EMAIL 1: Task Assigned
        // TRIGGER EMAIL 1: Task Assigned
        if (userId && updatedTask.assignee) {
            if (updatedTask.assignee.email) {
                console.log(`[Email Debug] Sending Assignment email to ${updatedTask.assignee.email}`)
                const { sendEmail } = await import('@/lib/email')
                const { emailTemplates } = await import('@/lib/email-templates')

                // MUST await sending to ensure it happens before serverless function exits
                await sendEmail({
                    to: updatedTask.assignee.email,
                    subject: `[New Task] Bạn được giao công việc mới: ${updatedTask.title}`,
                    html: emailTemplates.taskAssigned(
                        updatedTask.assignee.username || 'User',
                        updatedTask.title,
                        updatedTask.deadline,
                        updatedTask.id
                    )
                })
            } else {
                console.log(`[Email Debug] Assignment email skipped. User ${updatedTask.assignee.username} has no email.`)
            }
        }

        if (userId && updatedTask.assignee) {
            // ... (Email Logic)

            // TRIGGER 2: Auto-create Schedule Block 'TASK'
            if (updatedTask.deadline) {
                // If deadline exists, assume task takes e.g. 2 hours before deadline?
                // Or just create a 1-hour block at the deadline?
                // Let's create a block from (Deadline - 2h) to Deadline
                // BUT only if that time is in the future.
                const end = new Date(updatedTask.deadline)
                const start = new Date(end)
                start.setHours(start.getHours() - 2) // Default 2 hours estimate

                if (end > new Date()) {
                    try {
                        await prisma.userSchedule.create({
                            data: {
                                userId: userId,
                                startTime: start,
                                endTime: end,
                                type: 'TASK',
                                note: `Task: ${updatedTask.title}`
                            }
                        })
                    } catch (err) {
                        console.error("Failed to auto-schedule task", err)
                        // Don't fail the whole assignment if schedule fails
                    }
                }
            }
        }

        revalidatePath('/admin')
        revalidatePath('/admin/queue')
        revalidatePath('/dashboard')
        revalidatePath('/dashboard/schedule') // Update schedule view
        return { success: true }
    } catch (e) {
        return { error: 'Failed to assign task' }
    }
}
