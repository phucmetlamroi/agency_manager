'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma as globalPrisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

/**
 * Ensures the caller is authenticated and has the CLIENT role.
 * Returns the session user ID.
 */
async function getClientSession() {
    const session = await getSession()
    if (!session || session.user.role !== 'CLIENT') {
        redirect('/login')
    }
    return session.user.id
}

/**
 * Finds all client records associated with the user and their subsidiaries.
 */
async function getRelatedClientIds(clientUserId: string) {
    const user = await globalPrisma.user.findUnique({ where: { id: clientUserId } })
    if (!user) return []

    const rootClients = await globalPrisma.client.findMany({
        where: {
            OR: [
                { name: user.username },
                { name: user.nickname || '' }
            ]
        }
    })

    const rootIds = rootClients.map(c => c.id)
    const allIds = new Set(rootIds)

    if (rootIds.length > 0) {
        const subs = await globalPrisma.client.findMany({
            where: { parentId: { in: rootIds } }
        })
        subs.forEach(s => allIds.add(s.id))
    }

    return Array.from(allIds)
}

/**
 * Maps the 8 internal task states into 5 abstract states suitable for the Client Portal.
 */
function mapClientTaskStatus(internalStatus: string): string {
    const statusLower = internalStatus.toLowerCase()

    if (statusLower.includes('đợi') || statusLower.includes('đã nhận')) {
        return 'Pending'
    }
    if (statusLower.includes('thực hiện')) {
        return 'In Progress'
    }
    if (statusLower.includes('review')) {
        return 'Action Required'
    }
    if (statusLower.includes('revision') || statusLower.includes('sửa')) {
        return 'Revising'
    }
    if (statusLower.includes('hoàn tất') || statusLower.includes('lưu trữ')) {
        return 'Completed'
    }

    return 'Pending'
}

/**
 * Calculates a dynamic estimated cost to obscure internal profit boundaries.
 */
function calculateEstimatedCost(task: any): number {
    return task.jobPriceUSD ? Number(task.jobPriceUSD) : 0
}

/**
 * Fetches Tasks for the authenticated Client, strictly isolating data via ReBAC.
 */
export async function getClientTasks(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            createdAt: true,
            type: true,
            productLink: true,
            jobPriceUSD: true,
            project: {
                select: { id: true, name: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    return tasks.map(task => ({
        ...task,
        clientStatus: mapClientTaskStatus(task.status),
        estimatedCost: calculateEstimatedCost(task)
    }))
}

/**
 * Fetches Projects for the authenticated Client.
 */
export async function getClientProjects(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    return await prisma.project.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            tasks: {
                select: { id: true, status: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })
}

/**
 * Fetches Invoices for the authenticated Client.
 */
export async function getClientInvoices(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    return await prisma.invoice.findMany({
        where: {
            OR: [
                { clientUserId: clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            dueDate: true,
            totalDue: true,
            status: true,
            filePath: true,
            items: {
                select: { description: true, amount: true, quantity: true }
            }
        }
    })
}

/**
 * Submits a client's star rating for a completed task.
 */
export async function submitTaskRating(
    taskId: string,
    creativeQuality: number,
    responsiveness: number,
    communication: number,
    qualitativeFeedback?: string
) {
    const clientUserId = await getClientSession()

    // Verify the task belongs to this client
    const relatedClientIds = await getRelatedClientIds(clientUserId)
    const task = await globalPrisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        }
    })

    if (!task) {
        return { success: false, error: 'Task không tồn tại hoặc bạn không có quyền đánh giá.' }
    }

    // Check if already rated
    const existing = await globalPrisma.rating.findUnique({ where: { taskId } })
    if (existing) {
        return { success: false, error: 'Task này đã được đánh giá rồi.' }
    }

    // Find the staff (assignee)
    if (!task.assigneeId) {
        return { success: false, error: 'Task chưa được giao cho ai.' }
    }

    try {
        await globalPrisma.rating.create({
            data: {
                taskId,
                clientId: clientUserId,
                staffId: task.assigneeId,
                creativeQuality,
                responsiveness,
                communication,
                qualitativeFeedback: qualitativeFeedback || null,
                workspaceId: task.workspaceId || undefined
            }
        })

        return { success: true }
    } catch (err) {
        console.error('[submitTaskRating] Error:', err)
        return { success: false, error: 'Không thể lưu đánh giá.' }
    }
}

/**
 * Fetches the real task detail for the client portal task-detail page.
 */
export async function getTaskDetailForPortal(taskId: string) {
    const clientUserId = await getClientSession()
    const relatedClientIds = await getRelatedClientIds(clientUserId)

    const task = await globalPrisma.task.findFirst({
        where: {
            id: taskId,
            OR: [
                { clientUserId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        include: {
            rating: true,
            assignee: { select: { username: true, nickname: true } },
            client: { select: { name: true } },
            project: { select: { name: true } }
        }
    })

    if (!task) return null

    return {
        ...task,
        clientStatus: mapClientTaskStatus(task.status),
        estimatedCost: calculateEstimatedCost(task)
    }
}

/**
 * Fetches all ratings for a client's tasks — used by admin CRM to see client feedback.
 */
export async function getClientTaskRatings(
    clientUserId: string,
    workspaceId: string
) {
    const workspacePrisma = getWorkspacePrisma(workspaceId)
    return await workspacePrisma.rating.findMany({
        where: { clientId: clientUserId },
        include: {
            task: { select: { title: true } },
            staff: { select: { username: true, nickname: true } }
        },
        orderBy: { createdAt: 'desc' }
    })
}

/**
 * Discovers workspaces where the client has data or memberships.
 */
export async function getClientWorkspaces() {
    const userId = await getClientSession()
    const relatedClientIds = await getRelatedClientIds(userId)

    // Check memberships
    const memberships = await globalPrisma.workspaceMember.findMany({
        where: { userId },
        select: { workspaceId: true }
    })

    const workspaceIds = new Set(memberships.map(m => m.workspaceId))

    // Check Tasks for other workspaces not in memberships
    const dataWorkspaces = await globalPrisma.task.findMany({
        where: {
            OR: [
                { clientUserId: userId },
                { clientId: { in: relatedClientIds } }
            ]
        },
        select: { workspaceId: true },
        distinct: ['workspaceId']
    })

    dataWorkspaces.forEach(dw => {
        if (dw.workspaceId) workspaceIds.add(dw.workspaceId)
    })

    return await globalPrisma.workspace.findMany({
        where: { id: { in: Array.from(workspaceIds) } }
    })
}


