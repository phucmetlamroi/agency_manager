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
        await prisma.task.update({
            where: { id: taskId },
            data: {
                assigneeId: userId || null,
                isPenalized: false // Reset penalty state for new assignee
            }
        })
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to assign task' }
    }
}
