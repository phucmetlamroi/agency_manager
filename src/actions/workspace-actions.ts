'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { ensureNotLastOwner, LastOwnerProtectionError } from '@/lib/workspace-guards'
import { audit } from '@/lib/audit-log'

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
    const { canCreateWorkspace } = await import('@/lib/profile-permissions')
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
