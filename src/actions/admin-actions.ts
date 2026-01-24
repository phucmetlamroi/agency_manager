'use server'

import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

export async function createUser(formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string
    const role = formData.get('role') as string || 'USER'

    if (!username || !password) return { error: 'Missing fields' }

    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                plainPassword: password,
                role
            }
        })
        revalidatePath('/admin/users')
        revalidatePath('/admin') // Update Dashboard dropdown
        return { success: true }
        return { error: 'Error creating user' }
    }
}

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
                deadline: deadline ? new Date(deadline) : null,
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
