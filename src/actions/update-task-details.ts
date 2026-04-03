'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { parseVietnamDate } from '@/lib/date-utils'
import { getSession } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

export async function updateTaskDetails(id: string, data: {
    resources?: string
    references?: string
    notes?: string
    notes_en?: string
    title?: string
    productLink?: string
    deadline?: string
    jobPriceUSD?: number
    value?: number
    collectFilesLink?: string
}, workspaceId: string) {
    try {
        const session = await getSession()
        if (!session) return { error: 'Unauthorized' }
        const isAdmin = session.user.role === UserRole.ADMIN || session.user.isTreasurer
        const workspacePrisma = getWorkspacePrisma(workspaceId)

        // Fetch current task first to compare notes and check financial locks
        const currentTask = await workspacePrisma.task.findUnique({
            where: { id },
            select: { notes_vi: true, jobPriceUSD: true, value: true, exchangeRate: true, createdAt: true, assigneeId: true }
        })

        if (!currentTask) {
            return { error: 'Task not found' }
        }

        let updateData: any = {}

        if (isAdmin) {
            updateData = {
                resources: data.resources,
                references: data.references,
                title: data.title,
                collectFilesLink: data.collectFilesLink,
                productLink: data.productLink
            }
            if (data.notes !== undefined) updateData.notes_vi = data.notes
            if (data.notes_en !== undefined) updateData.notes_en = data.notes_en
        } else {
            // Non-admins are ONLY allowed to update their delivery/translation fields
            if (data.productLink !== undefined) updateData.productLink = data.productLink
            if (data.notes_en !== undefined) updateData.notes_en = data.notes_en
        }

        // Handle Price Updates (Financials) - STRICTLY ADMIN ONLY
        if (isAdmin && (data.jobPriceUSD !== undefined || data.value !== undefined)) {
            // FINANCIAL LOCK CHECK
            if (currentTask.assigneeId) {
                const month = currentTask.createdAt.getMonth() + 1
                const year = currentTask.createdAt.getFullYear()

                const payroll = await workspacePrisma.payroll.findUnique({
                    where: {
                        userId_month_year_workspaceId: {
                            userId: currentTask.assigneeId,
                            month,
                            year,
                            workspaceId
                        }
                    } as any
                })

                if (payroll && payroll.status === 'PAID') {
                    return { error: 'BLOCK: Kỳ lương này đã chốt (PAID). Không thể sửa đổi tài chính!' }
                }
            }

            const newJobPriceUSD = data.jobPriceUSD !== undefined ? data.jobPriceUSD : (currentTask.jobPriceUSD || 0)
            const newValue = data.value !== undefined ? data.value : (currentTask.value || 0) // This is Wage VND
            const rate = currentTask.exchangeRate || 26300

            updateData.jobPriceUSD = newJobPriceUSD
            updateData.value = newValue
            updateData.wageVND = newValue // Sync wageVND with value

            // Recalculate Profit
            updateData.profitVND = (Number(newJobPriceUSD) * Number(rate)) - Number(newValue)
        }

        // Handle Deadline Update - STRICTLY ADMIN ONLY
        if (isAdmin && data.deadline) {
            // Force Vietnam parsing
            updateData.deadline = parseVietnamDate(data.deadline)
            // Reset createdAt to "restart" the Smart Reminder timer
            updateData.createdAt = new Date()

            // Critical: Reset penalty flag so if they miss this NEW deadline, they get penalized again.
            updateData.isPenalized = false
        }

        await workspacePrisma.task.update({
            where: { id },
            data: updateData
        })
        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update task details' }
    }
}
