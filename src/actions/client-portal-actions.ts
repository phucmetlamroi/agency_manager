'use server'

import { getWorkspacePrisma } from '@/lib/prisma-workspace'
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
 * Maps the 8 internal task states into 5 abstract states suitable for the Client Portal.
 */
export function mapClientTaskStatus(internalStatus: string): string {
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
 * In a real implementation, this could use video complexity or duration.
 * For now, it defaults to the agreed jobPriceUSD.
 */
export function calculateEstimatedCost(task: any): number {
    return task.jobPriceUSD ? Number(task.jobPriceUSD) : 0
}

/**
 * Fetches Tasks for the authenticated Client, strictly isolating data via ReBAC.
 */
export async function getClientTasks(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)

    const tasks = await prisma.task.findMany({
        where: {
            clientUserId: clientUserId,
            workspaceId: workspaceId
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
            // DO NOT SELECT wageVND or profitVND
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
 * Fetches Projects for the authenticated Client, strictly isolating data via ReBAC.
 */
export async function getClientProjects(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)

    return await prisma.project.findMany({
        where: {
            clientUserId: clientUserId,
            workspaceId: workspaceId
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
 * Fetches Invoices for the authenticated Client, strictly isolating data via ReBAC.
 */
export async function getClientInvoices(workspaceId: string) {
    const clientUserId = await getClientSession()
    const prisma = getWorkspacePrisma(workspaceId)

    return await prisma.invoice.findMany({
        where: {
            clientUserId: clientUserId,
            workspaceId: workspaceId
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
