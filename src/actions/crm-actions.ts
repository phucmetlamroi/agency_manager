'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'

// --- CLIENT ACTIONS ---

export async function getClients(workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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

/**
 * Merges a standalone (root-level) client INTO another root-level client,
 * making it a subsidiary. Both must have parentId === null.
 */
export async function mergeClientIntoParent(childId: number, parentId: number, workspaceId: string) {
    try {
        if (childId === parentId) return { success: false, error: 'Không thể gộp khách hàng vào chính nó.' }

        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // Safety: ensure both are root-level clients
        const [child, parent] = await Promise.all([
            workspacePrisma.client.findUnique({ where: { id: childId }, select: { parentId: true } }),
            workspacePrisma.client.findUnique({ where: { id: parentId }, select: { parentId: true } })
        ])

        if (!child || !parent) return { success: false, error: 'Không tìm thấy khách hàng.' }
        if (child.parentId !== null) return { success: false, error: 'Khách hàng được kéo đã là khách hàng trực thuộc, không thể gộp.' }
        if (parent.parentId !== null) return { success: false, error: 'Khách hàng đích đến đã là khách hàng trực thuộc, không thể dùng làm khách hàng chính.' }

        await workspacePrisma.client.update({
            where: { id: childId },
            data: { parentId }
        })

        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        console.error('Merge failed:', error)
        return { success: false, error: 'Thất bại khi gộp khách hàng.' }
    }
}

/**
 * Removes the parentId of a subsidiary, making it a standalone root-level client again.
 */
export async function unmergeClient(clientId: number, workspaceId: string) {
    try {
        const session = await getSession()
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        await workspacePrisma.client.update({
            where: { id: clientId },
            data: { parentId: null }
        })

        revalidatePath(`/${workspaceId}/admin/crm`)
        return { success: true }
    } catch (error) {
        console.error('Unmerge failed:', error)
        return { success: false, error: 'Thất bại khi tách khách hàng.' }
    }
}
