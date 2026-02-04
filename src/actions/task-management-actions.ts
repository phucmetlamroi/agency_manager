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

export async function assignTask(taskId: string, assignmentId: string | null) {
    try {
        // 1. Auth Check
        const { getSession } = await import('@/lib/auth')
        const session = await getSession()
        if (!session) return { error: 'Unauthorized' }

        // 2. Fetch User & Task to validate scope
        const currentUser = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { ownedAgency: true }
        })
        const task = await prisma.task.findUnique({ where: { id: taskId } })

        if (!currentUser || !task) return { error: 'Not found' }

        const isSuperAdmin = currentUser.role === 'ADMIN'
        const ownedAgencyId = currentUser.ownedAgency[0]?.id

        // 3. Permission Checks
        if (!isSuperAdmin) {
            // If not Super Admin, MUST be Agency Admin (Owner)
            if (!ownedAgencyId) return { error: 'Permission denied' }

            // Check if Task belongs to this agency
            if (task.assignedAgencyId !== ownedAgencyId) {
                return { error: 'Task does not belong to your agency' }
            }

            // If assigning (not unassigning), check target validity
            if (assignmentId) {
                if (assignmentId.startsWith('agency:')) {
                    // Verify they are assigning to THEIR agency (sanity check)
                    const targetAgencyId = assignmentId.split(':')[1]
                    if (targetAgencyId !== ownedAgencyId) return { error: 'Cannot assign to other agencies' }
                } else {
                    // Verify target User is in their Agency
                    const targetUser = await prisma.user.findUnique({ where: { id: assignmentId } })
                    if (targetUser?.agencyId !== ownedAgencyId) {
                        return { error: 'Cannot assign to user outside your agency' }
                    }
                }
            }
        }

        let updateData: any = {}

        if (!assignmentId) {
            // Unassign All
            updateData = {
                assigneeId: null,
                // assignedAgencyId: null, // Don't clear agency if Agency Admin unassigned a member
                // Wait, if Super Admin unassigns, maybe they want to clear everything?
                // Let's keep agency link if it exists, unless specifically removing it?
                // For now, simplify: Unassigning a user keeps it in the Agency Pool if it was there.
                status: 'Đang đợi giao',
                isPenalized: false,
                deadline: null,
                timerStatus: 'PAUSED',
                timerStartedAt: null
            }
            // If Super Admin wants to fully reset, they might need a specialized "Reset" action?
            // Or we check if task WAS assigned to agency.
            if (isSuperAdmin && !task.assignedAgencyId) {
                // Classic behavior
            }
        } else if (assignmentId.startsWith('agency:')) {
            // Assign to Agency
            const agencyId = assignmentId.split(':')[1]
            updateData = {
                assignedAgencyId: agencyId,
                assigneeId: null,
                status: 'Đang đợi giao',
                isPenalized: false,
                timerStatus: 'PAUSED'
            }
        } else {
            // Assign to User
            updateData = {
                assigneeId: assignmentId,
                // assignedAgencyId: null, // Preserve agency link
                status: 'Đã nhận task',
                isPenalized: false,
                timerStatus: 'PAUSED',
                timerStartedAt: null
            }
        }

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: updateData,
            include: { assignee: true }
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
