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
}) {
    try {
        const updateData: any = {
            resources: data.resources,
            references: data.references,
            notes: data.notes,
            title: data.title,
            productLink: data.productLink
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
