'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'
import { verifyWorkspaceAccess } from '@/lib/security'

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
    notes_en: string | null
    type: string
}

export async function createBatchTasks(data: BatchTaskInput, workspaceId: string) {
    try {
        if (!data.titles || data.titles.length === 0) {
            return { error: 'Danh sách task trống' }
        }

        // Calculate financials once
        const revenueVND = data.jobPriceUSD * data.exchangeRate
        const profitVND = revenueVND - data.wageVND

        // Prepare deadline date object
        const deadlineDate = data.deadline ? parseVietnamDate(data.deadline) : null

        // Get current profile ID for isolation
        const { user } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        // Authorization checked above
        const currentProfileId = (user as any)?.sessionProfileId

        // Use standard prisma instead of extension for this complex transaction
        await prisma.$transaction(async (tx) => {
            for (const title of data.titles) {
                if (!title.trim()) continue;

                await tx.task.create({
                    data: {
                        title: title.trim(),
                        value: data.wageVND,
                        type: data.type,
                        deadline: deadlineDate,
                        resources: data.resources,
                        references: data.references,
                        collectFilesLink: data.collectFilesLink,
                        notes_vi: data.notes,
                        notes_en: data.notes_en,
                        assigneeId: data.assigneeId,
                        status: data.assigneeId ? 'Đã nhận task' : 'Đang đợi giao',

                        // Financials
                        jobPriceUSD: data.jobPriceUSD,
                        wageVND: data.wageVND,
                        exchangeRate: data.exchangeRate,
                        profitVND: profitVND,
                        clientId: data.clientId,
                        workspaceId: workspaceId, // Manual injection
                        profileId: currentProfileId // Manual isolation
                    }
                })
            }
        })

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`)

        return { success: true, count: data.titles.length }

    } catch (e) {
        console.error('Batch create error:', e)
        return { error: 'Lỗi khi tạo lô task. Vui lòng thử lại.' }
    }
}

// BULK DELETE
export async function bulkDeleteTasks(taskIds: string[], workspaceId: string) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        await prisma.task.deleteMany({
            where: {
                id: { in: taskIds },
                workspaceId: workspaceId // Manual isolation
            }
        })
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true, count: taskIds.length }
    } catch (error) {
        console.error("Bulk Delete Error:", error)
        return { error: "Failed to delete tasks" }
    }
}

// BULK UPDATE DETAILS
export async function bulkUpdateTaskDetails(taskIds: string[], data: any, workspaceId: string) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Filter out undefined/null values
        const updateData: any = {}
        if (data.resources !== undefined) updateData.resources = data.resources
        if (data.references !== undefined) updateData.references = data.references
        if (data.notes !== undefined) {
            updateData.notes_vi = data.notes
        }
        if (data.notes_en !== undefined) {
            updateData.notes_en = data.notes_en
        }
        if (data.productLink !== undefined) updateData.productLink = data.productLink
        if (data.deadline !== undefined) updateData.deadline = data.deadline ? parseVietnamDate(data.deadline) : null
        if (data.jobPriceUSD !== undefined) updateData.jobPriceUSD = data.jobPriceUSD
        if (data.value !== undefined) updateData.value = data.value
        if (data.collectFilesLink !== undefined) updateData.collectFilesLink = data.collectFilesLink

        await prisma.$transaction(async (tx) => {
            for (const id of taskIds) {
                await tx.task.update({
                    where: {
                        id,
                        workspaceId: workspaceId // Manual isolation
                    },
                    data: updateData
                })
            }
        })

        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true, count: taskIds.length }
    } catch (error) {
        console.error("Bulk Update Error:", error)
        return { error: "Failed to update tasks" }
    }
}

// BULK ASSIGN
export async function bulkAssignTasks(taskIds: string[], assigneeId: string | null, workspaceId: string) {
    if (!taskIds || taskIds.length === 0) return { error: "No tasks selected" }

    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        if (assigneeId && assigneeId.startsWith('agency:')) {
            return { error: 'Agency assignment is no longer supported.' }
        }
        const cleanAssigneeId = assigneeId || null

        const updateData: any = {}
        const notifications: any[] = []

        if (cleanAssigneeId) {
            // Check Rank D
            const latestRank = await prisma.monthlyRank.findFirst({
                where: { userId: cleanAssigneeId, workspaceId },
                orderBy: { createdAt: 'desc' }
            })
            if (latestRank && latestRank.rank === 'D') {
                return { error: 'Không thể giao Task: Nhân sự đang bị Cảnh cáo Đỏ (Rank D).' }
            }

            // Assign to USER
            updateData.assigneeId = cleanAssigneeId
            updateData.assignedAgencyId = null
            updateData.status = 'Đã nhận task'
        } else {
            // UNASSIGN (Back to Global Pool)
            updateData.assigneeId = null
            updateData.assignedAgencyId = null
            updateData.status = 'Đang đợi giao'
        }

        // Execute Update
        await prisma.$transaction(async (tx) => {
            for (const id of taskIds) {
                await tx.task.update({
                    where: {
                        id,
                        workspaceId: workspaceId // Manual isolation
                    },
                    data: updateData
                })
            }
        })

        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true, count: taskIds.length }

    } catch (error) {
        console.error("Bulk Assign Error:", error)
        return { error: "Failed to bulk assign tasks" }
    }
}
