'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateTaskStatus(id: string, newStatus: string) {
    try {
        await prisma.task.update({
            where: { id },
            data: { status: newStatus }
        })
        revalidatePath('/admin')
        revalidatePath('/dashboard')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}
