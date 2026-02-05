'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTaskDetails(id: string, data: {
    resources?: string
    references?: string
    notes?: string
    title?: string
    productLink?: string
    deadline?: string
    jobPriceUSD?: number
    value?: number
    collectFilesLink?: string
}) {
    try {
        const updateData: any = {
            resources: data.resources,
            references: data.references,
            notes: data.notes,
            title: data.title,
            productLink: data.productLink,
            collectFilesLink: data.collectFilesLink
        }

        // Handle Price Updates (Financials) - FIXED
        if (data.jobPriceUSD !== undefined || data.value !== undefined) {
            // Fetch current to merge
            const currentTask = await prisma.task.findUnique({
                where: { id },
                select: { jobPriceUSD: true, value: true, exchangeRate: true, createdAt: true, assigneeId: true }
            })

            if (currentTask) {
                // FINANCIAL LOCK CHECK
                if (currentTask.assigneeId) {
                    const month = currentTask.createdAt.getMonth() + 1
                    const year = currentTask.createdAt.getFullYear()

                    const payroll = await prisma.payroll.findUnique({
                        where: {
                            userId_month_year: {
                                userId: currentTask.assigneeId,
                                month,
                                year
                            }
                        }
                    })

                    if (payroll && payroll.status === 'PAID') {
                        return { error: 'BLOCK: Kỳ lương này đã chốt (PAID). Không thể sửa đổi tài chính!' }
                    }
                }

                const newJobPriceUSD = data.jobPriceUSD !== undefined ? data.jobPriceUSD : (currentTask.jobPriceUSD || 0)
                const newValue = data.value !== undefined ? data.value : (currentTask.value || 0) // This is Wage VND
                const rate = currentTask.exchangeRate || 25300

                updateData.jobPriceUSD = newJobPriceUSD
                updateData.value = newValue
                updateData.wageVND = newValue // Sync wageVND with value

                // Recalculate Profit
                updateData.profitVND = (Number(newJobPriceUSD) * Number(rate)) - Number(newValue)
            }
        }

        // Handle Deadline Update + Timer Reset
        if (data.deadline) {
            // Force Vietnam parsing
            updateData.deadline = new Date(data.deadline + ':00+07:00')
            // Reset createdAt to "restart" the Smart Reminder timer
            updateData.createdAt = new Date()

            // Critical: Reset penalty flag so if they miss this NEW deadline, they get penalized again.
            updateData.isPenalized = false

            // Also ensure status is NOT "Hoàn tất" if we are setting a deadline? 
            // Maybe not needed, Admin controls status separately.
        }

        await prisma.task.update({
            where: { id },
            data: updateData
        })
        revalidatePath('/admin')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update task details' }
    }
}
