'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'

type BatchTaskInput = {
    titles: string[]
    clientId: number | null
    assigneeId: string | null
    deadline: string | null
    jobPriceUSD: number
    exchangeRate: number
    wageVND: number
    resources: string | null
    references: string | null
    collectFilesLink: string | null
    notes: string | null
    type: string
}

export async function createBatchTasks(data: BatchTaskInput) {
    try {
        if (!data.titles || data.titles.length === 0) {
            return { error: 'Danh sách task trống' }
        }

        // Calculate financials once
        const revenueVND = data.jobPriceUSD * data.exchangeRate
        const profitVND = revenueVND - data.wageVND

        // Prepare deadline date object
        const deadlineDate = data.deadline ? parseVietnamDate(data.deadline) : null

        // FIX: Fetch assignee's agencyId if being assigned
        let assignedAgencyId: string | null = null
        if (data.assigneeId) {
            const assignee = await prisma.user.findUnique({
                where: { id: data.assigneeId },
                select: { agencyId: true }
            })
            assignedAgencyId = assignee?.agencyId || null
        }

        // Use transaction to ensure all tasks are created or none
        await prisma.$transaction(async (tx) => {
            for (const title of data.titles) {
                if (!title.trim()) continue;

                const task = await tx.task.create({
                    data: {
                        title: title.trim(),
                        value: data.wageVND, // This is the 'points' or wage for the user
                        type: data.type,
                        deadline: deadlineDate,
                        resources: data.resources,
                        references: data.references,
                        collectFilesLink: data.collectFilesLink,
                        notes: data.notes,
                        assigneeId: data.assigneeId,
                        assignedAgencyId: assignedAgencyId, // FIX: Sync with assignee's agency
                        status: data.assigneeId ? 'Đã nhận task' : 'Đang đợi giao',

                        // Financials
                        jobPriceUSD: data.jobPriceUSD,
                        wageVND: data.wageVND,
                        exchangeRate: data.exchangeRate,
                        profitVND: profitVND,
                        clientId: data.clientId,
                    }
                })

                // Create Notification if assigned
                if (data.assigneeId) {
                    await tx.notification.create({
                        data: {
                            userId: data.assigneeId,
                            message: `Bạn được giao task mới: "${title.trim()}"`,
                            // Schema verification: uses 'message', not 'content'. No 'link' field.
                            isRead: false
                        }
                    })
                }
            }
        })

        revalidatePath('/admin')
        revalidatePath('/admin/queue')
        revalidatePath('/admin/crm')

        return { success: true, count: data.titles.length }

    } catch (e) {
        console.error('Batch create error:', e)
        return { error: 'Lỗi khi tạo lô task. Vui lòng thử lại.' }
    }
}

// BULK DELETE
export async function bulkDeleteTasks(taskIds: string[]) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        await prisma.task.deleteMany({
            where: {
                id: { in: taskIds }
            }
        })
        revalidatePath('/admin/queue')
        revalidatePath('/dashboard')
        return { success: true, count: taskIds.length }
    } catch (error) {
        console.error("Bulk Delete Error:", error)
        return { error: "Failed to delete tasks" }
    }
}

// BULK UPDATE DETAILS
export async function bulkUpdateTaskDetails(taskIds: string[], data: any) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        // Filter out undefined/null values
        const updateData: any = {}
        if (data.resources !== undefined) updateData.resources = data.resources
        if (data.references !== undefined) updateData.references = data.references
        if (data.notes !== undefined) updateData.notes = data.notes
        if (data.productLink !== undefined) updateData.productLink = data.productLink
        if (data.deadline !== undefined) updateData.deadline = data.deadline ? parseVietnamDate(data.deadline) : null
        if (data.jobPriceUSD !== undefined) updateData.jobPriceUSD = data.jobPriceUSD
        if (data.value !== undefined) updateData.value = data.value
        if (data.collectFilesLink !== undefined) updateData.collectFilesLink = data.collectFilesLink

        await prisma.task.updateMany({
            where: {
                id: { in: taskIds }
            },
            data: updateData
        })

        revalidatePath('/admin/queue')
        revalidatePath('/dashboard')
        return { success: true, count: taskIds.length }
    } catch (error) {
        console.error("Bulk Update Error:", error)
        return { error: "Failed to update tasks" }
    }
}

// BULK ASSIGN
export async function bulkAssignTasks(taskIds: string[], assigneeId: string | null) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        const isAgency = assigneeId?.startsWith('agency:')
        const cleanAssigneeId = isAgency ? null : assigneeId
        const cleanAgencyId = isAgency ? assigneeId?.split(':')[1] : null

        // If assigning to a USER, we should also link their AGENCY
        let userAgencyId = null
        if (cleanAssigneeId) {
            const user = await prisma.user.findUnique({ where: { id: cleanAssigneeId }, select: { agencyId: true } })
            userAgencyId = user?.agencyId || null
        }

        // Determine correct assignedAgencyId
        // If assigning to Agency directly -> use that agency ID
        // If assigning to User -> use user's agency ID (if any)
        // If Unassigning -> keep existing agency? No, unassign usually means back to pool or global.
        // But logic in 'assignTask' says:
        // - If assign to User: update status='Đã nhận task', assigneeId=User, assignedAgencyId=UserAgency
        // - If assign to Agency: status='Đang đợi giao', assigneeId=null, assignedAgencyId=Agency
        // - If Unassign: status='Đang đợi giao', assigneeId=null, assignedAgencyId=null (or keep? Let's check logic)
        // Replicating 'assignTask' logic for consistency:

        const updateData: any = {}
        const notifications: any[] = []

        if (cleanAssigneeId) {
            // Assign to USER
            updateData.assigneeId = cleanAssigneeId
            updateData.assignedAgencyId = userAgencyId // Auto-link agency
            updateData.status = 'Đã nhận task'

            // Prepare notifications
            taskIds.forEach(id => {
                notifications.push({
                    userId: cleanAssigneeId,
                    message: `Bạn được giao task mới (Bulk Assign)`,
                    isRead: false,
                    // We can't easily link to multiple tasks, so generic message
                })
            })

        } else if (cleanAgencyId) {
            // Assign to AGENCY
            updateData.assigneeId = null
            updateData.assignedAgencyId = cleanAgencyId
            updateData.status = 'Đang đợi giao'
            // No user notification for agency assignment (usually)
        } else {
            // UNASSIGN (Back to Global Pool)
            updateData.assigneeId = null
            updateData.assignedAgencyId = null
            updateData.status = 'Đang đợi giao'
        }

        // Execute Update
        await prisma.$transaction(async (tx) => {
            await tx.task.updateMany({
                where: { id: { in: taskIds } },
                data: updateData
            })

            if (notifications.length > 0) {
                await tx.notification.createMany({
                    data: notifications
                })
            }
        })

        revalidatePath('/admin/queue')
        revalidatePath('/dashboard')
        return { success: true, count: taskIds.length }

    } catch (error) {
        console.error("Bulk Assign Error:", error)
        return { error: "Failed to bulk assign tasks" }
    }
}
