'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { parseVietnamDate } from '@/lib/date-utils'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

export async function updateUserRole(userId: string, newRole: string, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        await workspacePrisma.user.update({
            where: { id: userId },
            data: { role: newRole as UserRole }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update role' }
    }
}

export async function updateUserReputation(userId: string, change: number, workspaceId: string) {
    try {
        const workspacePrisma = getWorkspacePrisma(workspaceId)
        // Fetch current to check bounds
        const user = await workspacePrisma.user.findUnique({ where: { id: userId } })
        if (!user) return { error: 'User not found' }

        let newRep = (user.reputation || 100) + change
        if (newRep > 100) newRep = 100
        // We allow manual override below 0? Maybe not automatically lock here, leave that to the auto-checker 
        // or strictly follow rule "Points <= 0 => Lock".
        // Let's enforce the lock if score drops <= 0

        let newRole = user.role
        if (newRep <= 0 && user.role !== 'ADMIN') {
            newRole = 'LOCKED' as UserRole
        }

        await workspacePrisma.user.update({
            where: { id: userId },
            data: {
                reputation: newRep,
                role: newRole
            }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (e) {
        return { error: 'Failed to update reputation' }
    }
}

export async function createTask(formData: FormData, workspaceId: string) {
    try {
        const title = formData.get('title') as string
        const value = parseFloat(formData.get('value') as string) || 0

        let assigneeId: string | null = formData.get('assigneeId') as string
        if (!assigneeId || assigneeId === '' || assigneeId === 'null') {
            assigneeId = null
        }

        const deadline = formData.get('deadline') as string
        const references = formData.get('references') as string
        const fileLink = formData.get('fileLink') as string
        const type = formData.get('type') as string || 'Short form'
        const resources = formData.get('resources') as string
        const notes_vi = formData.get('notes') as string
        const notes_en = formData.get('notes_en') as string
        const collectFilesLink = formData.get('collectFilesLink') as string

        const jobPriceUSD = parseFloat(formData.get('jobPriceUSD') as string) || 0
        const exchangeRate = parseFloat(formData.get('exchangeRate') as string) || 25300
        const wageVND = parseFloat(formData.get('value') as string) || 0

        // Server-side calculation to ensure data integrity
        const revenueVND = jobPriceUSD * exchangeRate
        const profitVND = revenueVND - wageVND

        const clientId = formData.get('clientId') ? parseInt(formData.get('clientId') as string) : null

        // FIX: Fetch assignee's agencyId if being assigned
        let assignedAgencyId: string | null = null
        if (assigneeId) {
            const assignee = await prisma.user.findUnique({
                where: { id: assigneeId },
                select: { agencyId: true }
            })
            assignedAgencyId = assignee?.agencyId || null
        }

        const workspacePrisma = getWorkspacePrisma(workspaceId)

        await workspacePrisma.task.create({
            data: {
                title,
                value,
                type,
                deadline: deadline ? parseVietnamDate(deadline) : null,
                resources: resources || null,
                references: references || null,
                notes_vi: notes_vi || null,
                notes_en: notes_en || null,
                assigneeId: assigneeId || null,
                assignedAgencyId: assignedAgencyId, // FIX: Sync with assignee's agency
                fileLink: fileLink || null,
                collectFilesLink: collectFilesLink || null,
                status: assigneeId ? 'Đã nhận task' : 'Đang đợi giao',

                // Financials
                jobPriceUSD,
                wageVND,
                exchangeRate,
                profitVND,
                clientId
            }
        })
        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`) // Revalidate CRM to show new tasks
        return { success: true }
    } catch (e) {
        return { error: 'Error creating task' }
    }
}
