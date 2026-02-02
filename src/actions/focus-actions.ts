'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

export async function createFocusTask(userId: string, content: string) {
    try {
        // Get max order to append
        const maxOrder = await prisma.focusTask.findFirst({
            where: { userId },
            orderBy: { order: 'desc' },
            select: { order: true }
        })
        const nextOrder = (maxOrder?.order ?? -1) + 1

        const task = await prisma.focusTask.create({
            data: {
                userId,
                content,
                order: nextOrder
            }
        })
        revalidatePath('/admin/users')
        return { success: true, task }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function deleteFocusTask(id: string) {
    try {
        await prisma.focusTask.delete({ where: { id } })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function toggleFocusPriority(id: string) {
    try {
        const task = await prisma.focusTask.findUnique({ where: { id } })
        if (!task) return
        await prisma.focusTask.update({
            where: { id },
            data: { isPriority: !task.isPriority }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function swapFocusOrder(items: { id: string, order: number }[]) {
    try {
        // Transaction might be overkill if just swapping 2, but for list reorder safety:
        for (const item of items) {
            await prisma.focusTask.update({
                where: { id: item.id },
                data: { order: item.order }
            })
        }
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function publishFocusTasks(userId: string) {
    try {
        await prisma.focusTask.updateMany({
            where: { userId, status: 'DRAFT' },
            data: { status: 'PUBLISHED' }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function completeFocusTask(id: string) {
    try {
        const task = await prisma.focusTask.findUnique({ where: { id } })
        if (!task) return { error: 'Not found' }

        await prisma.focusTask.update({
            where: { id },
            data: { isDone: !task.isDone }
        })
        revalidatePath('/dashboard')
        // revalidatePath('/dashboard/focus') // Page removed
        return { success: true }
    } catch (e) {
        return { error: 'Failed' }
    }
}

export async function getFocusTasks(userId: string) {
    try {
        return await prisma.focusTask.findMany({
            where: { userId },
            orderBy: { order: 'asc' }
        })
    } catch (e) {
        return []
    }
}
