'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'

// --- CLIENT ACTIONS ---

export async function getClients(workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const clients = await workspacePrisma.client.findMany({
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

export async function getTopClients(workspaceId: string, limit = 5) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        const topClients = await workspacePrisma.client.findMany({
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

export async function createClient(data: { name: string, parentId?: number }, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.client.create({
            data: {
                name: data.name,
                parentId: data.parentId || null
            }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create client' }
    }
}

export async function updateClient(id: number, data: { name: string }, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.client.update({
            where: { id },
            data: { name: data.name }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to update client' }
    }
}

// --- PROJECT ACTIONS ---

export async function createProject(data: { name: string, clientId: number, code?: string }, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.project.create({
            data: {
                name: data.name,
                clientId: data.clientId,
                code: data.code
            }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create project' }
    }
}

// --- FEEDBACK ACTIONS ---

export async function createFeedback(data: { projectId: number, content: string, type: 'CLIENT' | 'INTERNAL', severity: number }, workspaceId: string) {
    try {
        // Feedback model may need workspace isolation double check, but assumed linked via project
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.feedback.create({
            data: {
                projectId: data.projectId,
                content: data.content,
                type: data.type,
                severity: data.severity
            }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to create feedback' }
    }
}

// --- DELETE ACTION ---

export async function deleteClient(id: number, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.client.delete({
            where: { id }
        })
        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        console.error('Delete failed:', error)
        return { success: false, error: 'Không thể xóa khách hàng này (có thể do đang chứa Task/Project/Brand con).' }
    }
}
