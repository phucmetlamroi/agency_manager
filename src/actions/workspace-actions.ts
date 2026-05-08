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

    // Self-service: any authenticated user with a valid profile can create a workspace.
    // The creator automatically becomes OWNER.
    const profileId = session.user.sessionProfileId
    if (!profileId) {
        return { error: 'Không tìm thấy Profile. Vui lòng đăng nhập lại.' }
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
 * Transfer workspace ownership from caller (current OWNER) to another existing member.
 *
 * Flow:
 * 1. Verify caller is OWNER of the workspace (or global admin).
 * 2. Verify target user is already a member of the same workspace.
 * 3. In a transaction: demote caller → ADMIN, promote target → OWNER.
 *
 * Last-admin protection is bypassed here because we're performing an atomic
 * swap (the workspace will still have exactly one OWNER after the transaction).
 *
 * Reference: spec mục 4 "transfer ownership" + Slack "Primary Owner" pattern.
 */
export async function transferWorkspaceOwnership(workspaceId: string, newOwnerUserId: string) {
    if (!newOwnerUserId) return { error: 'Phải chọn người nhận quyền sở hữu mới.' }

    try {
        // SECURITY: caller must be OWNER (not just ADMIN) to transfer ownership.
        const { workspaceRole, isGlobalAdmin, userId: callerId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        if (!isGlobalAdmin && workspaceRole !== 'OWNER') {
            return { error: 'Chỉ chủ sở hữu hiện tại (OWNER) mới có quyền chuyển nhượng.' }
        }

        if (callerId === newOwnerUserId) {
            return { error: 'Bạn đã là chủ sở hữu.' }
        }

        // Target must already be a member of this workspace.
        const targetMembership = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: newOwnerUserId,
                    workspaceId,
                },
            },
        })
        if (!targetMembership) {
            return { error: 'Người được chuyển nhượng phải là thành viên của Workspace.' }
        }

        // Atomic swap: demote caller → ADMIN, promote target → OWNER.
        // Skipping ensureNotLastOwner here because the swap preserves OWNER count.
        await prisma.$transaction([
            prisma.workspaceMember.update({
                where: {
                    userId_workspaceId: { userId: callerId, workspaceId },
                },
                data: { role: 'ADMIN' },
            }),
            prisma.workspaceMember.update({
                where: {
                    userId_workspaceId: { userId: newOwnerUserId, workspaceId },
                },
                data: { role: 'OWNER' },
            }),
        ])

        await audit({
            workspaceId,
            actorUserId: callerId,
            action: 'workspace.transferred_ownership',
            targetType: 'Workspace',
            targetId: workspaceId,
            before: { ownerId: callerId },
            after: { ownerId: newOwnerUserId },
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        revalidatePath('/workspace')
        return { success: true }
    } catch (error: any) {
        console.error('transferWorkspaceOwnership error:', error)
        if (error instanceof LastOwnerProtectionError) {
            return { error: error.message }
        }
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { error: error.message }
        }
        return { error: 'Lỗi khi chuyển quyền sở hữu Workspace.' }
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
