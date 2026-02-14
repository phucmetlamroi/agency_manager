'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// --- CLIENT ACTIONS ---

export async function getClients() {
    try {
        const clients = await prisma.client.findMany({
            where: { parentId: null }, // Only fetch top-level to start tree
            include: {
                subsidiaries: {
                    include: {
                        projects: true,
                        tasks: true
                    }
                },
                projects: true,
                tasks: true
            },
            orderBy: { createdAt: 'desc' }
        })
        return { success: true, data: clients }
    } catch (error) {
        console.error('Failed to fetch clients:', error)
        return { success: false, error: 'Failed to fetch clients' }
    }
}

export async function getTopClients(limit = 5) {
    try {
        const topClients = await prisma.client.findMany({
            orderBy: { aiScore: 'desc' },
            take: limit,
            where: {
                aiScore: { gt: 0 } // Only show scored clients
            },
            include: {
                _count: {
                    select: { tasks: true }
                },
                subsidiaries: {
                    include: {
                        _count: { select: { tasks: true } }
                    }
                }
            }
        })

        // Aggregate total tasks (Parent + Subsidiaries)
        const safeTopClients = topClients.map(c => {
            const subTasks = c.subsidiaries.reduce((sum, sub) => sum + sub._count.tasks, 0)
            return {
                ...c,
                totalTaskCount: c._count.tasks + subTasks
            }
        })

        return { success: true, data: safeTopClients }
    } catch (error) {
        return { success: false, error: 'Failed to fetch top clients' }
    }
}

export async function createClient(data: { name: string, parentId?: number }) {
    try {
        await prisma.client.create({
            data: {
                name: data.name,
                parentId: data.parentId || null
            }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create client' }
    }
}

export async function updateClient(id: number, data: { name: string }) {
    try {
        await prisma.client.update({
            where: { id },
            data: { name: data.name }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to update client' }
    }
}

// --- PROJECT ACTIONS ---

export async function createProject(data: { name: string, clientId: number, code?: string }) {
    try {
        await prisma.project.create({
            data: {
                name: data.name,
                clientId: data.clientId,
                code: data.code
            }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create project' }
    }
}

// --- FEEDBACK ACTIONS ---

export async function createFeedback(data: { projectId: number, content: string, type: 'CLIENT' | 'INTERNAL', severity: number }) {
    try {
        await prisma.feedback.create({
            data: {
                projectId: data.projectId,
                content: data.content,
                type: data.type,
                severity: data.severity
            }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create feedback' }
    }
}

// --- DELETE ACTION ---

export async function deleteClient(id: number) {
    try {
        await prisma.client.delete({
            where: { id }
        })
        revalidatePath('/admin/crm')
        return { success: true }
    } catch (error) {
        console.error('Delete failed:', error)
        return { success: false, error: 'Không thể xóa khách hàng này (có thể do đang chứa Task/Project/Brand con).' }
    }
}
