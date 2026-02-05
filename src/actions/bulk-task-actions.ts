'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

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
        const deadlineDate = data.deadline ? new Date(data.deadline + ':00+07:00') : null

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
