'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTaskDetails(id: string, data: {
    resources?: string
    references?: string
    notes?: string
    title?: string
}) {
    try {
        await prisma.task.update({
            where: { id },
            data: {
                resources: data.resources,
                references: data.references,
                notes: data.notes,
                title: data.title
            }
        })
        revalidatePath('/admin')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update task details' }
    }
}
