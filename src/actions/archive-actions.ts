'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function archiveTasksAction(month: number, year: number) {
    try {
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0, 23, 59, 59, 999)

        // Find tasks completed in that month
        const tasksToArchive = await prisma.task.findMany({
            where: {
                status: 'Hoàn tất',
                createdAt: {
                    gte: startDate,
                    lte: endDate
                },
                isArchived: false
            }
        })

        if (tasksToArchive.length === 0) {
            return { success: true, count: 0, message: "No completed tasks found for this month." }
        }

        // Update them
        const res = await prisma.task.updateMany({
            where: {
                id: { in: tasksToArchive.map(t => t.id) }
            },
            data: {
                isArchived: true
            }
        })

        revalidatePath('/admin')
        revalidatePath('/admin/archive')
        revalidatePath('/dashboard')

        return { success: true, count: res.count, message: `Archived ${res.count} tasks successfully.` }
    } catch (error: any) {
        console.error("Archive Error:", error)
        return { error: error.message || "Failed to archive tasks" }
    }
}
