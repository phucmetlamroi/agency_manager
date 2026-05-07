'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { ensureNotLastOwner, LastOwnerProtectionError } from '@/lib/workspace-guards'
import { audit } from '@/lib/audit-log'

export async function createWorkspaceAction(formData: FormData) {
    const session = await getSession()
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
        return { error: 'Chỉ Admin mới có quyền tạo Workspace mới.' }
    }

    const name = formData.get('name') as string
    const description = formData.get('description') as string

    if (!name || name.trim().length === 0) {
        return { error: 'Tên Workspace không được để trống' }
    }

    try {
        let newWorkspaceId = ''
        await prisma.$transaction(async (tx) => {
            const workspace = await tx.workspace.create({
                data: {
                    name,
                    description: description || null,
                    profileId: session.user.sessionProfileId
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
            after: { name, profileId: session.user.sessionProfileId },
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
