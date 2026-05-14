'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { parseVietnamDate } from '@/lib/date-utils'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { getSession } from '@/lib/auth'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'

export async function updateUserRole(userId: string, newRole: string, workspaceId: string) {
    try {
        // SECURITY: Verify caller is ADMIN of THIS workspace (not just global ADMIN).
        // Previously: any global ADMIN could change any user's role across all workspaces.
        const { session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (session?.user as any)?.sessionProfileId
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)
        await workspacePrisma.user.update({
            where: { id: userId },
            data: { role: newRole as UserRole }
        })
        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: e.message }
        }
        return { error: 'Failed to update role' }
    }
}

export async function createTask(formData: FormData, workspaceId: string) {
    try {
        // [Sprint B] Trial/subscription gating removed — tất cả user đều có quyền create task.
        // Verify caller has workspace ADMIN access (without subscription gate).
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // [Sprint K P1] Title required + trim — block whitespace-only titles.
        const title = (formData.get('title') as string || '').trim()
        if (!title) {
            return { error: 'Title is required' }
        }

        // [Sprint K P1] Safe number parsing — reject NaN explicitly.
        // parseFloat('abc') = NaN, `|| 0` silently coerces NaN → 0, hiding bad input.
        const safeNumber = (raw: unknown, fallback = 0): number => {
            if (raw === null || raw === undefined || raw === '') return fallback
            const n = parseFloat(String(raw))
            return Number.isFinite(n) ? n : fallback
        }

        const value = safeNumber(formData.get('value'))

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

        const jobPriceUSD = safeNumber(formData.get('jobPriceUSD'))
        const exchangeRate = safeNumber(formData.get('exchangeRate'), 26300)
        const wageVND = safeNumber(formData.get('value'))

        // Server-side calculation to ensure data integrity
        const revenueVND = jobPriceUSD * exchangeRate
        const profitVND = revenueVND - wageVND

        const clientId = formData.get('clientId') ? parseInt(formData.get('clientId') as string) : null

        // SECURITY: Verify caller is ADMIN of THIS workspace (workspace-scoped check).
        // Replaces previous global `session.user.role === 'ADMIN'` check that ignored workspace boundary.
        const { session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = (session?.user as any)?.sessionProfileId

        // [Sprint T] GUARD against orphan tasks. workspacePrisma middleware
        // INJECTS workspaceId + profileId vào create payload, nhưng nếu các
        // params bị empty/undefined → middleware inject undefined → DB lưu NULL
        // → task orphan invisible khỏi admin queries.
        if (!workspaceId || workspaceId.trim() === '') {
            console.error('[createTask] BLOCK: workspaceId empty')
            return { error: 'Lỗi nội bộ: workspaceId thiếu.' }
        }
        if (!profileId || typeof profileId !== 'string') {
            console.error('[createTask] BLOCK: profileId missing from session', { workspaceId, userId: session?.user?.id })
            return { error: 'Lỗi nội bộ: profileId thiếu — vui lòng chọn lại profile rồi thử lại.' }
        }

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
                clientId,

                // [Sprint P] Track admin who assigned this task \u2014 used by email +
                // in-app notification routing in updateTaskStatus.
                assignedById: session?.user?.id || null,
            }
        })

        // [Sprint Z+1 hotfix] Auto-create WorkspaceMember row cho assignee
        // \u2192 fix bug "Save failed" khi USER role \u0111\u01b0\u1ee3c assign task m\u00e0 kh\u00f4ng c\u00f3
        // WorkspaceMember row \u2192 verifyWorkspaceAccess throws.
        if (assigneeId) {
            const { ensureWorkspaceMembership } = await import('@/lib/workspace-membership')
            await ensureWorkspaceMembership(assigneeId, workspaceId, 'MEMBER')
        }

        // [Sprint P] Audit log: task.assigned (G\u01101 \u2014 admin t\u1ea1o + assign)
        if (session?.user?.id) {
            void audit({
                workspaceId,
                actorUserId: session.user.id,
                action: 'task.assigned',
                targetType: 'Task',
                targetId: task.id,
                after: { title, assigneeId, status: task.status },
            })
        }

        // Notify assignee via email + in-app notification (G\u01101 spec)
        if (assigneeId && session?.user?.id) {
            const actorId = session.user.id
            const actor = await prisma.user.findUnique({
                where: { id: actorId },
                select: { username: true, nickname: true, avatarUrl: true },
            }).catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Admin'

            void (async () => {
                try {
                    // In-app notification
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

                    // [Sprint P] Email to assignee \u2014 G\u01101 (taskAssigned template)
                    const assignee = await prisma.user.findUnique({
                        where: { id: assigneeId },
                        select: { email: true, username: true, nickname: true },
                    }).catch(() => null)
                    if (assignee?.email) {
                        const { sendEmail } = await import('@/lib/email')
                        const { emailTemplates } = await import('@/lib/email-templates')
                        const userName = assignee.nickname || assignee.username || 'b\u1ea1n'
                        const html = emailTemplates.taskAssigned(
                            userName,
                            title,
                            task.deadline,
                            task.id,
                        )
                        const subject = `[New Task] B\u1ea1n \u0111\u01b0\u1ee3c giao nhi\u1ec7m v\u1ee5 m\u1edbi: ${title}`
                        await sendEmail({ to: assignee.email, subject, html })
                    }
                } catch (err) {
                    console.error('[createTask] notification/email error:', err)
                }
            })()
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        revalidatePath(`/${workspaceId}/admin/crm`)
        revalidatePath(`/${workspaceId}/dashboard`)
        return { success: true }
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: e.message }
        }
        return { error: 'Error creating task' }
    }
}
