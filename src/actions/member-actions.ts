'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { verifyWorkspaceAccess } from '@/lib/security'
import { ensureNotLastOwner, LastOwnerProtectionError } from '@/lib/workspace-guards'
import { isWorkspaceRole, hasAtLeastRole, type WorkspaceRole } from '@/lib/workspace-roles'
import { audit } from '@/lib/audit-log'

const INVITATION_EXPIRY_DAYS = 14

// ─── Get workspace members with roles ────────────────────────────
export async function getWorkspaceMembers(workspaceId: string) {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
            user: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    email: true,
                    avatarUrl: true,
                    role: true, // global role
                }
            }
        },
        orderBy: [
            // OWNERs first, then ADMINs, then MEMBERs, then GUESTs
            { joinedAt: 'asc' }
        ]
    })

    // Sort by role weight (OWNER > ADMIN > MEMBER > GUEST)
    const ROLE_ORDER: Record<string, number> = { OWNER: 4, ADMIN: 3, MEMBER: 2, GUEST: 1 }
    members.sort((a, b) => (ROLE_ORDER[b.role] ?? 0) - (ROLE_ORDER[a.role] ?? 0))

    return { members }
}

// ─── Get pending invitations for a workspace ─────────────────────
export async function getWorkspaceInvitations(workspaceId: string) {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    try {
        const invitations = await prisma.workspaceInvitation.findMany({
            where: {
                workspaceId,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
            include: {
                invitedUser: {
                    select: { id: true, username: true, nickname: true, email: true, avatarUrl: true }
                },
                invitedBy: {
                    select: { id: true, username: true, nickname: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        return { invitations }
    } catch (err: any) {
        // Table may not exist pre-migration
        if (err?.code === 'P2021') return { invitations: [] }
        throw err
    }
}

// ─── Get my pending invitations (for invitee) ────────────────────
export async function getMyPendingInvitations() {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { invitations: [] }

    try {
        const invitations = await prisma.workspaceInvitation.findMany({
            where: {
                invitedUserId: session.user.id,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            },
            include: {
                workspace: { select: { id: true, name: true, description: true } },
                invitedBy: { select: { id: true, username: true, nickname: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return { invitations }
    } catch (err: any) {
        if (err?.code === 'P2021') return { invitations: [] }
        throw err
    }
}

// ─── Invite a user to workspace ──────────────────────────────────
export async function inviteToWorkspace(
    workspaceId: string,
    targetUsername: string,
    role: WorkspaceRole = 'MEMBER',
    message?: string
) {
    const { userId: inviterId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    // Validate role — can't invite as OWNER directly
    if (role === 'OWNER') {
        return { error: 'Không thể mời với vai trò OWNER. Hãy mời làm ADMIN rồi chuyển quyền sở hữu.' }
    }
    if (!isWorkspaceRole(role)) {
        return { error: 'Vai trò không hợp lệ.' }
    }

    const trimmedUsername = targetUsername.trim()
    if (!trimmedUsername) return { error: 'Tên người dùng không được để trống.' }

    // Find target user
    const targetUser = await prisma.user.findFirst({
        where: {
            OR: [
                { username: { equals: trimmedUsername, mode: 'insensitive' } },
                { email: { equals: trimmedUsername, mode: 'insensitive' } },
            ]
        },
        select: { id: true, username: true, nickname: true, role: true }
    })

    if (!targetUser) {
        return { error: `Không tìm thấy người dùng "${trimmedUsername}".` }
    }

    if (targetUser.id === inviterId) {
        return { error: 'Bạn không thể tự mời chính mình.' }
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId: targetUser.id,
                workspaceId,
            }
        }
    })

    if (existingMember) {
        return { error: `${targetUser.nickname || targetUser.username} đã là thành viên của workspace này.` }
    }

    // Check for existing pending invitation
    try {
        const existingInvite = await prisma.workspaceInvitation.findFirst({
            where: {
                workspaceId,
                invitedUserId: targetUser.id,
                status: 'PENDING',
                expiresAt: { gt: new Date() },
            }
        })

        if (existingInvite) {
            return { error: `${targetUser.nickname || targetUser.username} đã có lời mời đang chờ.` }
        }
    } catch (err: any) {
        // Table might not exist yet — continue to create
        if (err?.code !== 'P2021') throw err
    }

    // Check if user is in the same profile — if so, add directly
    const inviter = await prisma.user.findUnique({
        where: { id: inviterId },
        select: { profileId: true }
    })

    const isSameProfile = inviter?.profileId && inviter.profileId === (
        await prisma.user.findUnique({
            where: { id: targetUser.id },
            select: { profileId: true }
        })
    )?.profileId

    if (isSameProfile) {
        // Direct add for same-profile users
        await prisma.workspaceMember.create({
            data: {
                userId: targetUser.id,
                workspaceId,
                role,
            }
        })

        await audit({
            workspaceId,
            actorUserId: inviterId,
            action: 'member.joined',
            targetType: 'WorkspaceMember',
            targetId: targetUser.id,
            after: { username: targetUser.username, role, method: 'direct_add' },
        })

        revalidatePath(`/${workspaceId}/admin/members`)
        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true, directAdd: true, username: targetUser.nickname || targetUser.username }
    }

    // Cross-profile: create invitation
    try {
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_DAYS * 24 * 3600 * 1000)

        const invitation = await prisma.workspaceInvitation.create({
            data: {
                workspaceId,
                invitedUserId: targetUser.id,
                role,
                invitedById: inviterId,
                message: message?.trim() || null,
                expiresAt,
            }
        })

        await audit({
            workspaceId,
            actorUserId: inviterId,
            action: 'member.invited',
            targetType: 'WorkspaceInvitation',
            targetId: invitation.id,
            after: { targetUsername: targetUser.username, role },
        })

        revalidatePath(`/${workspaceId}/admin/members`)
        return { success: true, directAdd: false, username: targetUser.nickname || targetUser.username }
    } catch (err: any) {
        if (err?.code === 'P2021') {
            // Fallback: if invitation table doesn't exist, add directly
            await prisma.workspaceMember.create({
                data: {
                    userId: targetUser.id,
                    workspaceId,
                    role,
                }
            })
            revalidatePath(`/${workspaceId}/admin/members`)
            return { success: true, directAdd: true, username: targetUser.nickname || targetUser.username }
        }
        console.error('[inviteToWorkspace] error:', err)
        return { error: 'Lỗi khi mời thành viên.' }
    }
}

// ─── Accept workspace invitation ─────────────────────────────────
export async function acceptWorkspaceInvitation(invitationId: string) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }

    try {
        // Atomic accept: use interactive transaction to prevent TOCTOU race.
        // The updateMany with status='PENDING' acts as a compare-and-swap lock:
        // if another concurrent request already accepted, updateMany returns count=0.
        const result = await prisma.$transaction(async (tx) => {
            // Atomically claim the invitation (CAS: only if still PENDING)
            const updated = await tx.workspaceInvitation.updateMany({
                where: {
                    id: invitationId,
                    invitedUserId: session.user.id,
                    status: 'PENDING',
                    expiresAt: { gt: new Date() },
                },
                data: {
                    status: 'ACCEPTED',
                    respondedAt: new Date(),
                },
            })

            if (updated.count === 0) {
                // Either doesn't exist, wrong user, already handled, or expired
                return { error: 'Lời mời không tồn tại, đã được xử lý, hoặc đã hết hạn.' }
            }

            // Now read the invitation for workspace info (safe — we own the lock)
            const invitation = await tx.workspaceInvitation.findUnique({
                where: { id: invitationId },
                include: { workspace: { select: { id: true, name: true, status: true } } }
            })

            if (!invitation) return { error: 'Lời mời không tồn tại.' }
            if (invitation.workspace.status !== 'ACTIVE') return { error: 'Workspace không còn hoạt động.' }

            // Create membership (skip if already a member — edge case: direct-added while invite pending)
            const existingMember = await tx.workspaceMember.findUnique({
                where: {
                    userId_workspaceId: {
                        userId: session.user.id,
                        workspaceId: invitation.workspaceId,
                    }
                }
            })

            if (!existingMember) {
                await tx.workspaceMember.create({
                    data: {
                        userId: session.user.id,
                        workspaceId: invitation.workspaceId,
                        role: invitation.role,
                    }
                })
            }

            return {
                success: true,
                workspaceId: invitation.workspaceId,
                workspaceName: invitation.workspace.name,
                role: invitation.role,
            }
        })

        if ('error' in result) return result

        await audit({
            workspaceId: result.workspaceId!,
            actorUserId: session.user.id,
            action: 'member.joined',
            targetType: 'WorkspaceMember',
            targetId: session.user.id,
            after: { role: result.role, method: 'invitation_accepted' },
        })

        revalidatePath(`/${result.workspaceId}/admin/members`)
        revalidatePath('/workspace')
        return { success: true, workspaceId: result.workspaceId, workspaceName: result.workspaceName }
    } catch (err: any) {
        console.error('[acceptWorkspaceInvitation] error:', err)
        return { error: 'Lỗi khi chấp nhận lời mời.' }
    }
}

// ─── Decline workspace invitation ────────────────────────────────
export async function declineWorkspaceInvitation(invitationId: string) {
    const { getSession } = await import('@/lib/auth')
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' }

    try {
        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { id: invitationId }
        })

        if (!invitation) return { error: 'Lời mời không tồn tại.' }
        if (invitation.invitedUserId !== session.user.id) return { error: 'Forbidden' }
        if (invitation.status !== 'PENDING') return { error: 'Lời mời đã được xử lý.' }

        await prisma.workspaceInvitation.update({
            where: { id: invitationId },
            data: { status: 'DECLINED', respondedAt: new Date() }
        })

        revalidatePath(`/${invitation.workspaceId}/admin/members`)
        return { success: true }
    } catch (err: any) {
        console.error('[declineWorkspaceInvitation] error:', err)
        return { error: 'Lỗi khi từ chối lời mời.' }
    }
}

// ─── Revoke a pending invitation ─────────────────────────────────
export async function revokeWorkspaceInvitation(workspaceId: string, invitationId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    try {
        const invitation = await prisma.workspaceInvitation.findUnique({
            where: { id: invitationId }
        })

        if (!invitation) return { error: 'Lời mời không tồn tại.' }
        if (invitation.workspaceId !== workspaceId) return { error: 'Forbidden' }
        if (invitation.status !== 'PENDING') return { error: 'Lời mời đã được xử lý.' }

        await prisma.workspaceInvitation.update({
            where: { id: invitationId },
            data: { status: 'REVOKED', respondedAt: new Date() }
        })

        await audit({
            workspaceId,
            actorUserId: userId,
            action: 'member.invitation_revoked',
            targetType: 'WorkspaceInvitation',
            targetId: invitationId,
            after: { invitedUserId: invitation.invitedUserId },
        })

        revalidatePath(`/${workspaceId}/admin/members`)
        return { success: true }
    } catch (err: any) {
        console.error('[revokeWorkspaceInvitation] error:', err)
        return { error: 'Lỗi khi thu hồi lời mời.' }
    }
}

// ─── Change a member's workspace role ────────────────────────────
export async function changeWorkspaceMemberRole(
    workspaceId: string,
    targetUserId: string,
    newRole: WorkspaceRole
) {
    const { userId: actorId, workspaceRole: actorRole, isGlobalAdmin } =
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    if (!isWorkspaceRole(newRole)) {
        return { error: 'Vai trò không hợp lệ.' }
    }

    // Can't change own role (use transfer ownership instead)
    if (actorId === targetUserId) {
        return { error: 'Bạn không thể tự đổi vai trò. Hãy dùng chức năng chuyển quyền sở hữu.' }
    }

    // OWNER role must use transferOwnership
    if (newRole === 'OWNER') {
        return { error: 'Sử dụng chức năng "Chuyển quyền sở hữu" để chỉ định OWNER mới.' }
    }

    // Find target membership first — need oldRole for all permission checks
    const targetMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        include: {
            user: { select: { username: true, nickname: true } }
        }
    })

    if (!targetMember) return { error: 'Người dùng không phải thành viên workspace này.' }

    const oldRole = targetMember.role

    // PERMISSION: Only OWNER (or global admin) can touch ADMIN-level members.
    // This covers BOTH promoting TO admin AND demoting FROM admin.
    if (!isGlobalAdmin && actorRole !== 'OWNER') {
        if (newRole === 'ADMIN' || oldRole === 'ADMIN' || oldRole === 'OWNER') {
            return { error: 'Chỉ OWNER mới có quyền thay đổi vai trò ADMIN/OWNER.' }
        }
    }

    // Protect last OWNER
    if (oldRole === 'OWNER') {
        try {
            await ensureNotLastOwner(workspaceId, targetUserId)
        } catch (err) {
            if (err instanceof LastOwnerProtectionError) {
                return { error: err.message }
            }
            throw err
        }
    }

    await prisma.workspaceMember.update({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        data: { role: newRole }
    })

    await audit({
        workspaceId,
        actorUserId: actorId,
        action: 'member.role_changed',
        targetType: 'WorkspaceMember',
        targetId: targetUserId,
        before: { role: oldRole, username: targetMember.user.username },
        after: { role: newRole },
    })

    revalidatePath(`/${workspaceId}/admin/members`)
    revalidatePath(`/${workspaceId}/admin/users`)
    return { success: true }
}

// ─── Remove a member from workspace ──────────────────────────────
export async function removeWorkspaceMember(workspaceId: string, targetUserId: string) {
    const { userId: actorId, workspaceRole: actorRole, isGlobalAdmin } =
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    if (actorId === targetUserId) {
        return { error: 'Sử dụng "Rời khỏi workspace" để tự rời.' }
    }

    const targetMember = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        },
        include: {
            user: { select: { username: true, nickname: true } }
        }
    })

    if (!targetMember) return { error: 'Người dùng không phải thành viên workspace này.' }

    // Can't remove OWNER unless you're also OWNER or global admin
    if (targetMember.role === 'OWNER' && !isGlobalAdmin && actorRole !== 'OWNER') {
        return { error: 'Chỉ OWNER mới có quyền xóa OWNER khác.' }
    }

    // Can't remove ADMIN unless you're OWNER or global admin
    if (targetMember.role === 'ADMIN' && !isGlobalAdmin && actorRole !== 'OWNER') {
        return { error: 'Chỉ OWNER mới có quyền xóa ADMIN.' }
    }

    // Protect last OWNER
    if (targetMember.role === 'OWNER') {
        try {
            await ensureNotLastOwner(workspaceId, targetUserId)
        } catch (err) {
            if (err instanceof LastOwnerProtectionError) {
                return { error: err.message }
            }
            throw err
        }
    }

    await prisma.workspaceMember.delete({
        where: {
            userId_workspaceId: { userId: targetUserId, workspaceId }
        }
    })

    await audit({
        workspaceId,
        actorUserId: actorId,
        action: 'member.removed',
        targetType: 'WorkspaceMember',
        targetId: targetUserId,
        before: { role: targetMember.role, username: targetMember.user.username },
    })

    revalidatePath(`/${workspaceId}/admin/members`)
    revalidatePath(`/${workspaceId}/admin/users`)
    return { success: true }
}

// ─── Leave workspace (self-remove) ───────────────────────────────
export async function leaveWorkspace(workspaceId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    // Protect last OWNER
    try {
        await ensureNotLastOwner(workspaceId, userId)
    } catch (err) {
        if (err instanceof LastOwnerProtectionError) {
            return { error: 'Bạn là OWNER duy nhất. Hãy chuyển quyền sở hữu trước khi rời.' }
        }
        throw err
    }

    const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        include: { user: { select: { username: true } } }
    })

    if (!member) return { error: 'Bạn không phải thành viên workspace này.' }

    await prisma.workspaceMember.delete({
        where: { userId_workspaceId: { userId, workspaceId } }
    })

    await audit({
        workspaceId,
        actorUserId: userId,
        action: 'member.left',
        targetType: 'WorkspaceMember',
        targetId: userId,
        before: { role: member.role, username: member.user.username },
    })

    revalidatePath('/workspace')
    return { success: true }
}

// ─── Get users available to invite (same profile, not already members) ──
export async function getAvailableUsersForInvite(workspaceId: string) {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

    // Get current user's profile
    const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { profileId: true }
    })

    if (!currentUser?.profileId) return { users: [] }

    // Get existing member IDs
    const existingMembers = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { userId: true }
    })
    const memberIds = new Set(existingMembers.map(m => m.userId))

    // Get users in the same profile who aren't already members.
    // SECURITY: Only query by profileId — do NOT include profileAccesses
    // to prevent cross-profile user enumeration.
    const availableUsers = await prisma.user.findMany({
        where: {
            profileId: currentUser.profileId,
            role: { not: 'LOCKED' },
        },
        select: {
            id: true,
            username: true,
            nickname: true,
            email: true,
            avatarUrl: true,
            role: true,
        },
        orderBy: { username: 'asc' }
    })

    return {
        users: availableUsers.filter(u => !memberIds.has(u.id))
    }
}
