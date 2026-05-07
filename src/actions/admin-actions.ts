'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { parseVietnamDate } from '@/lib/date-utils'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'

export async function updateUserRole(userId: string, newRole: string, workspaceId: string) {
    try {
        const session = await getSession()
        if (session?.user?.role !== 'ADMIN') return { error: 'Unauthorized' }
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
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
        const submissionFolder = formData.get('submissionFolder') as string
        const productLink = formData.get('productLink') as string
        const frameUsername = formData.get('frameUsername') as string
        const framePassword = formData.get('framePassword') as string
        const frameNote = formData.get('frameNote') as string

        const jobPriceUSD = parseFloat(formData.get('jobPriceUSD') as string) || 0
        const exchangeRate = parseFloat(formData.get('exchangeRate') as string) || 26300
        const wageVND = parseFloat(formData.get('value') as string) || 0

        // Server-side calculation to ensure data integrity
        const revenueVND = jobPriceUSD * exchangeRate
        const profitVND = revenueVND - wageVND

        const clientId = formData.get('clientId') ? parseInt(formData.get('clientId') as string) : null

        const session = await getSession()
        if (session?.user?.role !== 'ADMIN') return { error: 'Unauthorized' }
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        const task = await workspacePrisma.task.create({
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
                fileLink: fileLink || null,
                collectFilesLink: collectFilesLink || null,
                submissionFolder: submissionFolder || null,
                productLink: productLink || null,
                frameUsername: frameUsername || null,
                framePassword: framePassword || null,
                frameNote: frameNote || null,
                status: assigneeId ? 'Nh\u1eadn task' : '\u0110ang \u0111\u1ee3i giao',

                // Financials
                jobPriceUSD,
                wageVND,
                exchangeRate,
                profitVND,
                clientId
            }
        })

        // Notify assignee via email + in-app notification
        if (assigneeId && session?.user?.id) {
            const actorId = session.user.id
            const actor = await prisma.user.findUnique({
                where: { id: actorId },
                select: { username: true, nickname: true, avatarUrl: true },
            }).catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Admin'

            void (async () => {
                try {
                    const notif = await createNotificationInternal({
                        userId: assigneeId,
                        type: 'TASK_ASSIGNED',
                        title: 'New task assigned',
                        body: `${actorName} assigned you "${title}"`,
                        avatarUrl: actor?.avatarUrl,
                        taskId: task.id,
                        actorId,
                        metadata: { taskTitle: title },
                    })
                    void broadcastNotificationToUser(assigneeId, {
                        id: notif.id,
                        type: notif.type,
                        title: notif.title,
                        body: notif.body,
                        avatarUrl: notif.avatarUrl,
                        conversationId: notif.conversationId,
                        messageId: notif.messageId,
                        taskId: notif.taskId,
                        actorId: notif.actorId,
                        metadata: notif.metadata,
                        createdAt: notif.createdAt.toISOString(),
                        isRead: false,
                    })
                } catch (err) {
                    console.error('[createTask] notification error:', err)
                }
            })()
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e) {
        return { error: 'Error creating task' }
    }
}
