'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function updateUserRole(userId: string, newRole: string) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        })
        revalidatePath('/admin/users')
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update role' }
    }
}

export async function updateUserReputation(userId: string, change: number) {
    try {
        // Fetch current to check bounds
        const user = await prisma.user.findUnique({ where: { id: userId } })
        if (!user) return { error: 'User not found' }

        let newRep = (user.reputation || 100) + change
        if (newRep > 100) newRep = 100
        // We allow manual override below 0? Maybe not automatically lock here, leave that to the auto-checker 
        // or strictly follow rule "Points <= 0 => Lock".
        // Let's enforce the lock if score drops <= 0

        let newRole = user.role
        if (newRep <= 0 && user.role !== 'ADMIN') {
            newRole = 'LOCKED'
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                reputation: newRep,
                role: newRole
            }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update reputation' }
    }
}

export async function createTask(formData: FormData) {
    const title = formData.get('title') as string
    const value = parseFloat(formData.get('value') as string) || 0
    const assigneeId = formData.get('assigneeId') as string
    const deadline = formData.get('deadline') as string
    const references = formData.get('references') as string
    const fileLink = formData.get('fileLink') as string // Backward/Alias

    // New fields
    const type = formData.get('type') as string || 'Short form'
    const resources = formData.get('resources') as string
    const notes = formData.get('notes') as string

    try {
        await prisma.task.create({
            data: {
                title,
                value,
                assigneeId: assigneeId || null,
                // Appending :00+07:00 to force parsing as Vietnam Timezone
                deadline: deadline ? new Date(deadline + ':00+07:00') : null,
                references: references || null,
                fileLink: fileLink || null,
                resources: resources || null,
                notes: notes || null,
                type,
                status: 'Đang thực hiện'
            }
        })
        revalidatePath('/admin')
        return { success: true }
    } catch (e) {
        return { error: 'Error creating task' }
    }
}
