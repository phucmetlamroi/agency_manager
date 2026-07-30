'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { parseVietnamDate } from '@/lib/date-utils'
import { getWorkspacePrisma, resolveWorkspaceProfileId } from '@/lib/prisma-workspace'
import { sanitizeExternalUrl } from '@/lib/safe-url'
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
        const actorId = session.user.id
        // [PHẢN BIỆN 2026-07-30 · CS-3] Profile CỦA WORKSPACE, không phải claim JWT — xem lý do đầy
        // đủ ở `resolveWorkspaceProfileId` (lib/prisma-workspace.ts) và ở `isAssigneeInWorkspaceProfile`.
        // FAIL CLOSED: `User` nằm trong bypassModels nên profileId là bộ lọc tenant duy nhất; thiếu
        // nó thì `getWorkspacePrisma` bên dưới ghi vào User mà không có hàng rào tenant nào.
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) {
            return { error: 'Workspace chưa gắn Profile — không thể đổi vai trò.' }
        }

        // [AUDIT R2 — fix] Without these guards a workspace ADMIN could (a) escalate
        // anyone to the legacy global ADMIN (super-admin) role, (b) set an arbitrary/
        // invalid role string, or (c) change the role of a user in ANOTHER tenant
        // (User is a global model — workspacePrisma does NOT scope it). Account-level
        // admin-ness now lives in ProfileRole (changeProfileRoleAction), so the only
        // roles assignable here are non-privileged.
        const ASSIGNABLE_ROLES: UserRole[] = [UserRole.USER, UserRole.AGENCY_ADMIN]
        if (!ASSIGNABLE_ROLES.includes(newRole as UserRole)) {
            return { error: 'Vai trò không hợp lệ cho thao tác này.' }
        }
        if (userId === actorId) {
            return { error: 'Không thể tự đổi vai trò của chính mình.' }
        }
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { profileId: true } })
        if (!target) return { error: 'Người dùng không tồn tại.' }
        // [AUDIT R5 — fix] No JWT role==='ADMIN' escape hatch (Sprint Z removed the
        // global super-admin); the cross-profile check is unconditional.
        if (target.profileId && target.profileId !== profileId) {
            return { error: 'Bạn không thể đổi vai trò của user thuộc Profile khác.' }
        }
        // [AUDIT R11 — fix] The guard above no-ops when target.profileId is null (same
        // null-profileId class closed for deactivateUser in R10). Require a positive
        // tenancy link to THIS workspace's profile before the global User.role write.
        const wsForTenancy = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        const tenantProfileId = wsForTenancy?.profileId ?? null
        const [tenancyMember, tenancyAccess] = await Promise.all([
            prisma.workspaceMember.findUnique({
                where: { userId_workspaceId: { userId, workspaceId } },
                select: { role: true },
            }),
            tenantProfileId
                ? prisma.profileAccess.findUnique({
                      where: { userId_profileId: { userId, profileId: tenantProfileId } },
                      select: { role: true },
                  })
                : Promise.resolve(null),
        ])
        const targetBelongsToTenant =
            (!!tenantProfileId && target.profileId === tenantProfileId) ||
            !!tenancyMember ||
            !!tenancyAccess
        if (!targetBelongsToTenant) {
            return { error: 'Không thể đổi vai trò của user không thuộc Workspace/Profile này.' }
        }

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
        // [Trial P0] "Người quản lý" — optional; defaults to the creator server-side.
        const managerId = (formData.get('managerId') as string) || ''

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
        const profileId = await resolveWorkspaceProfileId(workspaceId)

        // [Sprint T] GUARD against orphan tasks. workspacePrisma middleware
        // INJECTS workspaceId + profileId vào create payload, nhưng nếu các
        // params bị empty/undefined → middleware inject undefined → DB lưu NULL
        // → task orphan invisible khỏi admin queries.
        if (!workspaceId || workspaceId.trim() === '') {
            console.error('[createTask] BLOCK: workspaceId empty')
            return { error: 'Lỗi nội bộ: workspaceId thiếu.' }
        }
        if (!profileId || typeof profileId !== 'string') {
            console.error('[createTask] BLOCK: workspace chưa gắn profileId', { workspaceId, userId: session?.user?.id })
            return { error: 'Workspace này chưa gắn Profile — không thể tạo task. Báo quản trị viên.' }
        }

        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // [AUDIT R14 — fix] Validate clientId belongs to THIS profile (Client is
        // profile-scoped; a foreign numeric id would otherwise attach to the task and
        // surface another profile's client name wherever task.client is included).
        if (clientId != null) {
            const clientOk = await prisma.client.findFirst({
                where: { id: clientId, profileId },
                select: { id: true },
            })
            if (!clientOk) {
                return { error: 'Khách hàng được chọn không hợp lệ.' }
            }
        }

        // [Bug 2026-06-10 — Task_assigneeId_fkey FK violation]
        // Velox auto-assign and the manual editor picker can both surface a
        // stale userId — e.g. the autoSave draft was authored when the user
        // existed but the row was later removed via raw SQL (no Prisma
        // cascade), or the picker showed a global user who's no longer a
        // workspace member. Reaching Prisma with such an id throws the
        // ugly "Foreign key constraint violated" error toast the user sees.
        // Validate the User exists FIRST so we can return a friendly
        // Vietnamese message and let the rest of the form survive.
        if (assigneeId) {
            const userExists = await prisma.user.findUnique({
                where: { id: assigneeId },
                select: { id: true },
            })
            if (!userExists) {
                console.error('[createTask] BLOCK: assigneeId references non-existent User', { assigneeId, workspaceId })
                return {
                    error:
                        'Editor được chọn không còn tồn tại trong hệ thống — ' +
                        'có thể đã bị xoá hoặc bạn vừa chuyển workspace. ' +
                        'Vui lòng bỏ chọn assignee (Leave Blank → Task Pool) hoặc chọn lại editor khác rồi thử lại.',
                }
            }
            // [AUDIT R14 — fix] The assignee must already belong to THIS workspace's
            // profile — otherwise an admin could pass a foreign-tenant userId, whom
            // ensureWorkspaceMembership below would silently provision into this profile.
            const { isAssigneeInWorkspaceProfile } = await import('@/lib/workspace-membership')
            const assigneeAllowed = await isAssigneeInWorkspaceProfile(assigneeId, workspaceId)
            if (!assigneeAllowed) {
                return { error: 'Editor được chọn không thuộc workspace/profile này. Hãy mời họ vào workspace trước khi giao việc.' }
            }
        }

        // [Trial P0] Validate the Manager (assignedById) belongs to this workspace/profile
        // before letting it override the default creator.
        if (managerId) {
            const { isAssigneeInWorkspaceProfile } = await import('@/lib/workspace-membership')
            const managerAllowed = await isAssigneeInWorkspaceProfile(managerId, workspaceId)
            if (!managerAllowed) {
                return { error: 'Người quản lý được chọn không thuộc workspace/profile này.' }
            }
        }

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
                // [AUDIT HT-031 fix] formData thô — chưa từng lọc scheme ở đường này.
                productLink: sanitizeExternalUrl(productLink) || null,
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
                // [Trial P0] Now the explicit "Ng\u01b0\u1eddi qu\u1ea3n l\u00fd": the picked manager, else the creator.
                assignedById: managerId || session?.user?.id || null,
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
        // [Velox v4] Return the new task id so the wrapper can persist the
        // Multi-Hook Map (TaskRawFootage) right after creation. Callers that
        // only check `success: true` keep working unchanged.
        return { success: true, taskId: task.id }
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: e.message }
        }
        return { error: 'Error creating task' }
    }
}

/**
 * [Trial P0] Reassign a task's "Người quản lý" (assignedById). Admin-only; the new
 * manager must belong to this workspace's profile. Pass managerId='' to clear.
 */
export async function updateTaskManager(taskId: string, managerId: string, workspaceId: string) {
    try {
        const { session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId || typeof profileId !== 'string') {
            return { error: 'Lỗi nội bộ: profileId thiếu.' }
        }
        const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

        // Task must belong to this workspace/profile (middleware scopes the query).
        const task = await workspacePrisma.task.findFirst({ where: { id: taskId }, select: { id: true } })
        if (!task) return { error: 'Không tìm thấy task.' }

        const mgr = managerId?.trim() || ''
        if (mgr) {
            const { isAssigneeInWorkspaceProfile } = await import('@/lib/workspace-membership')
            const ok = await isAssigneeInWorkspaceProfile(mgr, workspaceId)
            if (!ok) return { error: 'Người quản lý được chọn không thuộc workspace/profile này.' }
        }

        await workspacePrisma.task.update({
            where: { id: taskId },
            data: { assignedById: mgr || null },
        })

        if (session?.user?.id) {
            void audit({
                workspaceId, actorUserId: session.user.id, action: 'task.assigned',
                targetType: 'Task', targetId: taskId, after: { assignedById: mgr || null, field: 'manager' },
            })
        }

        revalidatePath(`/${workspaceId}/admin`)
        revalidatePath(`/${workspaceId}/admin/queue`)
        return { success: true }
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) return { error: e.message }
        return { error: 'Không cập nhật được người quản lý.' }
    }
}
