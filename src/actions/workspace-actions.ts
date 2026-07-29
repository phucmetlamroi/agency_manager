'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { ensureNotLastOwner, LastOwnerProtectionError } from '@/lib/workspace-guards'
import { audit } from '@/lib/audit-log'
import { extractPayrollCycle } from '@/lib/payroll-cycle'
import { SALARY_COMPLETED_STATUS } from '@/lib/task-statuses'

export async function createWorkspaceAction(formData: FormData) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Bạn cần đăng nhập để tạo Workspace.' }
    }

    // [Sprint Z] Profile-gated: chỉ Owner/Admin của profile mới tạo workspace được.
    // SaaS multi-tenant model — không có super admin override.
    const profileId = session.user.sessionProfileId
    if (!profileId) {
        return { error: 'Không tìm thấy Profile. Vui lòng đăng nhập lại.' }
    }

    // [Sprint Z] RBAC gate — Owner hoặc Admin role mới được tạo workspace.
    const { canCreateWorkspace, isSessionLive } = await import('@/lib/profile-permissions')
    // [AUDIT HT-033 fix] NỬA SAU CỦA ĐƯỜNG NÉ LỆNH KHOÁ. canCreateWorkspace chỉ đọc
    // ProfileAccess.role — nó KHÔNG BAO GIỜ đọc User.role hay User.sessionVersion. Nên một tài
    // khoản đã bị khoá vẫn "có quyền" theo nghĩa của vị từ đó, và nếu nó vừa tự tạo Profile ở
    // createProfileForUser thì nó chính là OWNER của profile mới → qua cổng dễ dàng.
    // Vị từ phân quyền trả lời "vai trò này được làm gì"; nó không trả lời "tài khoản này còn
    // sống không". Phải hỏi cả hai.
    if (!(await isSessionLive(session))) {
        return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
    }
    if (!(await canCreateWorkspace(session.user.id, profileId))) {
        return { error: 'Bạn không có quyền tạo Workspace trong Profile này. Chỉ Owner và Admin mới được tạo.' }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string

    if (!name || name.trim().length === 0) {
        return { error: 'Tên Workspace không được để trống' }
    }
    if (name.trim().length > 50) {
        return { error: 'Tên Workspace không được quá 50 ký tự' }
    }
    if (description && description.trim().length > 200) {
        return { error: 'Mô tả không được quá 200 ký tự' }
    }

    // Rate limit: max 10 workspaces owned per user to prevent abuse.
    const ownedCount = await prisma.workspaceMember.count({
        where: { userId: session.user.id, role: 'OWNER' },
    })
    if (ownedCount >= 10) {
        return { error: 'Bạn đã đạt giới hạn 10 Workspace. Hãy xóa workspace cũ trước khi tạo mới.' }
    }

    // [Sprint B] Subscription gating removed — tất cả user đều có quyền tạo workspace.
    // Rate limit 10/user vẫn còn để chống abuse.

    try {
        let newWorkspaceId = ''
        await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name: name.trim(),
                    description: description?.trim() || null,
                    profileId,
                }
            })
            newWorkspaceId = workspace.id

            await tx.workspaceMember.create({
                data: {
                    userId: session.user.id,
                    workspaceId: workspace.id,
                    role: 'OWNER'
                }
            })
        })

        await audit({
            workspaceId: newWorkspaceId,
            actorUserId: session.user.id,
            action: 'workspace.created',
            targetType: 'Workspace',
            targetId: newWorkspaceId,
            after: { name: name.trim(), profileId },
        })

        revalidatePath('/workspace')
        return { success: true, workspaceId: newWorkspaceId }
    } catch (e: any) {
        console.error(e)
        return { error: 'Lỗi khởi tạo Workspace' }
    }
}

export async function renameWorkspaceAction(workspaceId: string, newName: string) {
    if (!newName || newName.trim().length === 0) {
        return { error: 'Tên mới không được để trống' }
    }

    try {
        // SECURITY: Verify caller is OWNER/ADMIN of THIS workspace.
        // Without this, any authenticated user could rename any workspace by ID.
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const before = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { name: true },
        })

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { name: newName }
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'workspace.updated',
            targetType: 'Workspace',
            targetId: workspaceId,
            before: { name: before?.name },
            after: { name: newName },
        })

        revalidatePath('/workspace')
        return { success: true }
    } catch (error: any) {
        console.error(error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        return { error: 'Lỗi khi đổi tên Workspace' }
    }
}

export async function getWorkspacesForProfile(profileId: string) {
    const session = await getSession()
    if (!session?.user?.id) return []

    // Hide soft-deleted workspaces from the switcher.
    // The `status` column may not exist pre-migration; in that case the where
    // clause silently degrades (Postgres treats unknown column as error so
    // we fall back to no filter via try/catch).
    try {
        return await prisma.workspace.findMany({
            where: {
                profileId,
                status: 'ACTIVE',
            } as any,
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, description: true }
        })
    } catch (err: any) {
        if (err?.code === 'P2009' || /column.*does not exist/i.test(err?.message ?? '')) {
            // Pre-migration fallback.
            return prisma.workspace.findMany({
                where: { profileId },
                orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, description: true }
            })
        }
        throw err
    }
}

/**
 * [Sprint Z+1] DEPRECATED — workspace-level OWNER concept removed.
 *
 * Profile Owner is implicit OWNER of all workspaces in the profile (via
 * verifyWorkspaceAccess in src/lib/security.ts). To "transfer workspace
 * ownership", transfer ownership of the parent Profile via
 * `transferProfileOwnershipAction` in profile-member-actions.ts.
 *
 * This function now throws to alert old callers; UI components have been
 * updated to remove the workspace-level transfer button (Sprint Z+1 Z+1.10).
 */
export async function transferWorkspaceOwnership(_workspaceId: string, _newOwnerUserId: string) {
    return {
        error: 'Transfer ownership đã chuyển sang Profile level (Sprint Z+1). Vào Profile Members → Transfer ownership của Profile thay vì workspace.',
    }
}

export async function deleteWorkspaceAction(workspaceId: string) {
    try {
        // SECURITY: Verify caller is at least ADMIN; then enforce OWNER for delete.
        // Global admins bypass membership check via verifyWorkspaceAccess.
        const { workspaceRole, isGlobalAdmin, userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        if (!isGlobalAdmin && workspaceRole !== 'OWNER') {
            return { error: 'Bạn không có quyền xóa Workspace này. Chỉ chủ sở hữu mới có quyền xóa.' }
        }

        // SOFT-DELETE: workspace becomes invisible to switcher; hard delete
        // happens after `hardDeleteAfter` (30 days) via cron. OWNER can restore
        // within that window.
        // NOTE: requires schema migration 20260507000000_workspace_security_phase1
        // to be applied. Until then, falls back to hard-delete.
        const HARD_DELETE_GRACE_DAYS = 30
        const hardDeleteAfter = new Date(Date.now() + HARD_DELETE_GRACE_DAYS * 24 * 3600 * 1000)

        try {
            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    status: 'SOFT_DELETED',
                    deletedAt: new Date(),
                    hardDeleteAfter,
                } as any, // cast: schema added these in migration; ts-types may lag locally
            })

            await audit({
                workspaceId,
                actorUserId: userId,
                action: 'workspace.soft_deleted',
                targetType: 'Workspace',
                targetId: workspaceId,
                after: { hardDeleteAfter: hardDeleteAfter.toISOString() },
            })
        } catch (softErr: any) {
            // If migration not yet applied, the new columns won't exist.
            // Fall back to hard delete (legacy behavior).
            if (softErr?.code === 'P2009' || softErr?.code === 'P2025' || /column.*does not exist/i.test(softErr?.message ?? '')) {
                console.warn('[deleteWorkspace] soft-delete columns missing — falling back to hard delete')

                // Audit fix #4.2: Log workspace info BEFORE hard-delete (workspace
                // sẽ bị xóa khỏi DB → audit row vẫn giữ vì workspaceId column
                // KHÔNG cascade khi target row delete; tham chiếu chỉ là string).
                // Capture workspace name + member count để forensics nếu cần.
                let workspaceMeta: any = null
                try {
                    const ws = await prisma.workspace.findUnique({
                        where: { id: workspaceId },
                        select: {
                            name: true,
                            description: true,
                            createdAt: true,
                            _count: { select: { members: true, tasks: true } },
                        },
                    })
                    workspaceMeta = ws
                } catch { /* best-effort */ }

                await audit({
                    workspaceId: 'SYSTEM', // workspace sắp delete → dùng SYSTEM marker
                    actorUserId: userId,
                    action: 'workspace.hard_deleted',
                    targetType: 'Workspace',
                    targetId: workspaceId,
                    before: {
                        name: workspaceMeta?.name ?? 'unknown',
                        description: workspaceMeta?.description ?? null,
                        createdAt: workspaceMeta?.createdAt?.toISOString() ?? null,
                        memberCount: workspaceMeta?._count?.members ?? null,
                        taskCount: workspaceMeta?._count?.tasks ?? null,
                        reason: 'soft-delete-fallback (migration not applied)',
                    },
                })

                await prisma.workspace.delete({ where: { id: workspaceId } })
            } else {
                throw softErr
            }
        }

        revalidatePath('/workspace')
        return { success: true }
    } catch (error: any) {
        console.error(error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        return { error: 'Lỗi khi xóa Workspace' }
    }
}

/**
 * List soft-deleted workspaces mà current user là OWNER (để hiển thị trang Trash).
 * Audit fix #3.1: User cần thấy workspaces đã xóa mềm để restore trước khi
 * cron hard-delete (sau 30 ngày).
 */
export async function getMyTrashedWorkspaces() {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized', workspaces: [] }

    const userId = session.user.id

    // Get OWNER memberships (chỉ OWNER được restore)
    const memberships = await prisma.workspaceMember.findMany({
        where: { userId, role: 'OWNER' },
        select: { workspaceId: true },
    })
    const workspaceIds = memberships.map(m => m.workspaceId)

    if (workspaceIds.length === 0) return { workspaces: [] }

    const workspaces = await prisma.workspace.findMany({
        where: {
            id: { in: workspaceIds },
            status: 'SOFT_DELETED',
        } as any,
        select: {
            id: true,
            name: true,
            description: true,
            deletedAt: true,
            hardDeleteAfter: true,
        } as any,
        orderBy: { deletedAt: 'desc' } as any,
    })

    return {
        workspaces: workspaces.map((w: any) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            deletedAt: w.deletedAt?.toISOString() ?? null,
            hardDeleteAfter: w.hardDeleteAfter?.toISOString() ?? null,
            daysUntilHardDelete: w.hardDeleteAfter
                ? Math.max(0, Math.ceil((w.hardDeleteAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                : 0,
        })),
    }
}

/**
 * Restore a soft-deleted workspace within the 30-day grace window.
 * Only available to global admins or original owners (verified via membership).
 */
export async function restoreWorkspaceAction(workspaceId: string) {
    try {
        const { workspaceRole, isGlobalAdmin, userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        if (!isGlobalAdmin && workspaceRole !== 'OWNER') {
            return { error: 'Chỉ OWNER mới có thể khôi phục Workspace.' }
        }

        await prisma.workspace.update({
            where: { id: workspaceId },
            data: {
                status: 'ACTIVE',
                deletedAt: null,
                hardDeleteAfter: null,
            } as any,
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'workspace.restored',
            targetType: 'Workspace',
            targetId: workspaceId,
        })

        revalidatePath('/workspace')
        return { success: true }
    } catch (error: any) {
        console.error(error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        return { error: 'Lỗi khi khôi phục Workspace.' }
    }
}

/**
 * [Trial P2] Monthly rollover — "Tạo tháng tiếp theo".
 *
 * Creates the NEXT month's workspace (derived from the current workspace's
 * "Tháng M/YYYY" name via extractPayrollCycle) and copies every UNFINISHED task
 * into it, so the recurring monthly setup (same clients, editors, managers,
 * pricing, asset links) doesn't have to be re-typed each cycle. The client's
 * #1 retention pain: "giảm lặp lại hàng tháng".
 *
 * What copies: title, type, deadline (+1 calendar month), client, editor
 * (assignee), manager (assignedBy), pricing (value/exchangeRate/jobPriceUSD/
 * profit/wage), asset links (raw/broll/collect/submit/frame), notes, duration.
 * What RESETS: status → fresh start, delivery outputs (fileLink/productLink),
 * client-review state, invoice binding (→ UNBILLED), penalty, version,
 * projectId (Project is workspace-scoped — carrying it would cross-link months).
 * NOT carried: task tags, Multi-Hook Map (rawFootage), video versions, comments,
 * client requests.
 *
 * Finished ('Hoàn tất') and cancelled ('Đã hủy') and archived tasks are skipped.
 */
export async function createNextMonthWithRollover(currentWorkspaceId: string) {
    let userId: string
    let profileId: string | null
    try {
        // Caller must be ADMIN/OWNER of the source workspace (this also confirms
        // membership + resolves the profile the new workspace inherits).
        const access = await verifyWorkspaceAccess(currentWorkspaceId, 'ADMIN')
        userId = access.userId
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) return { error: error.message }
        return { error: 'Bạn không có quyền tạo tháng mới cho Workspace này.' }
    }

    const source = await prisma.workspace.findUnique({
        where: { id: currentWorkspaceId },
        select: { id: true, name: true, profileId: true },
    })
    if (!source) return { error: 'Không tìm thấy Workspace nguồn.' }
    profileId = source.profileId

    // Derive next month from the source name ("Tháng 6/2026" → 7/2026).
    const { month, year } = extractPayrollCycle(source.name)
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const newName = `Tháng ${nextMonth}/${nextYear}`

    // Guard: don't silently mint a duplicate month.
    const dup = await prisma.workspace.findFirst({
        where: { profileId: profileId ?? undefined, name: newName, status: 'ACTIVE' } as any,
        select: { id: true },
    })
    if (dup) {
        return { error: `Workspace "${newName}" đã tồn tại. Hãy mở workspace đó hoặc đổi tên trước.` }
    }

    // Mirror createWorkspaceAction's abuse cap (10 owned per user).
    const ownedCount = await prisma.workspaceMember.count({
        where: { userId, role: 'OWNER' },
    })
    if (ownedCount >= 10) {
        return { error: 'Bạn đã đạt giới hạn 10 Workspace. Hãy xóa workspace cũ trước khi tạo mới.' }
    }

    // Pull the unfinished tasks to roll forward.
    const openTasks = await prisma.task.findMany({
        where: {
            workspaceId: currentWorkspaceId,
            isArchived: false,
            status: { notIn: [SALARY_COMPLETED_STATUS, 'Đã hủy'] },
        },
        select: {
            title: true, deadline: true, value: true, type: true,
            references: true, resources: true, notes_vi: true, notes_en: true,
            assigneeId: true, assignedById: true, clientId: true, assignedAgencyId: true,
            exchangeRate: true, jobPriceUSD: true, profitVND: true, wageVND: true,
            collectFilesLink: true, submissionFolder: true,
            frameUsername: true, framePassword: true, frameNote: true, duration: true,
        },
    })

    const addOneMonth = (d: Date | null): Date | null => {
        if (!d) return null
        const r = new Date(d)
        r.setMonth(r.getMonth() + 1)
        return r
    }

    try {
        let newWorkspaceId = ''
        let copied = 0
        await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name: newName,
                    description: `Chuyển tiếp từ "${source.name}" — task chưa hoàn tất đã được sao chép sang.`,
                    profileId: profileId ?? undefined,
                },
            })
            newWorkspaceId = workspace.id

            await tx.workspaceMember.create({
                data: { userId, workspaceId: workspace.id, role: 'OWNER' },
            })

            if (openTasks.length > 0) {
                const rows = openTasks.map((t) => ({
                    title: t.title,
                    deadline: addOneMonth(t.deadline),
                    value: t.value,
                    // Fresh start: assigned-but-not-started if it has an editor,
                    // else waiting-to-assign.
                    status: t.assigneeId ? 'Nhận task' : 'Đang đợi giao',
                    type: t.type,
                    references: t.references,
                    resources: t.resources,
                    notes_vi: t.notes_vi,
                    notes_en: t.notes_en,
                    assigneeId: t.assigneeId,
                    assignedById: t.assignedById,
                    clientId: t.clientId,
                    assignedAgencyId: t.assignedAgencyId,
                    exchangeRate: t.exchangeRate,
                    jobPriceUSD: t.jobPriceUSD,
                    profitVND: t.profitVND,
                    wageVND: t.wageVND,
                    collectFilesLink: t.collectFilesLink,
                    submissionFolder: t.submissionFolder,
                    frameUsername: t.frameUsername,
                    framePassword: t.framePassword,
                    frameNote: t.frameNote,
                    duration: t.duration,
                    // Reset — new month, nothing delivered/billed yet.
                    fileLink: null,
                    productLink: null,
                    projectId: null,
                    invoiceId: null,
                    invoiceStatus: 'UNBILLED' as const,
                    isArchived: false,
                    isPenalized: false,
                    version: 0,
                    clientReview: null,
                    clientFeedback: null,
                    clientReviewedAt: null,
                    currentVersionId: null,
                    workspaceId: workspace.id,
                    profileId: profileId ?? undefined,
                }))
                const res = await tx.task.createMany({ data: rows })
                copied = res.count
            }
        }, { timeout: 30000 })

        await audit({
            workspaceId: newWorkspaceId,
            actorUserId: userId,
            action: 'workspace.created',
            targetType: 'Workspace',
            targetId: newWorkspaceId,
            after: { name: newName, rolledFrom: source.name, tasksCopied: copied },
        })

        revalidatePath('/workspace')
        return { success: true, workspaceId: newWorkspaceId, name: newName, tasksCopied: copied }
    } catch (e: any) {
        console.error('[createNextMonthWithRollover]', e)
        return { error: 'Lỗi khi tạo tháng mới. Vui lòng thử lại.' }
    }
}
