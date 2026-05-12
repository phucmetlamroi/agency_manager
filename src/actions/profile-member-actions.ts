'use server'

/**
 * [Sprint Z] Profile-level member management — replaces super-admin model with
 * proper RBAC. Only Profile OWNER có thể remove/change roles. Both OWNER + ADMIN
 * có thể invite. USER chỉ có read access.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import type { ProfileRole } from '@prisma/client'
import {
    canInviteMember,
    canRemoveMember,
    canChangeMemberRole,
    canTransferOwnership,
    getProfileRole,
    getProfileAccess,
} from '@/lib/profile-permissions'
import { audit } from '@/lib/audit-log'

/* ──────────────────────────────────────────────────────────────────── */
/*  Helpers                                                              */
/* ──────────────────────────────────────────────────────────────────── */

async function requireAuthenticated() {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Bạn cần đăng nhập.' as const, session: null }
    }
    return { error: null, session }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Get profile members                                                  */
/* ──────────────────────────────────────────────────────────────────── */

export async function getProfileMembers(profileId: string) {
    const { error, session } = await requireAuthenticated()
    if (error || !session) return { error, members: [] }

    // Caller phải có role trong profile (kể cả USER cũng read được list)
    const role = await getProfileRole(session.user.id, profileId)
    if (!role) {
        return { error: 'Bạn không có quyền truy cập profile này.', members: [] }
    }

    const accesses = await prisma.profileAccess.findMany({
        where: { profileId },
        orderBy: [{ role: 'asc' }, { grantedAt: 'asc' }],
        select: {
            id: true,
            userId: true,
            role: true,
            grantedAt: true,
            user: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    displayName: true,
                    email: true,
                    avatarUrl: true,
                },
            },
        },
    })

    // Mask email if caller is USER (only OWNER/ADMIN see full emails)
    const isPrivileged = role === 'OWNER' || role === 'ADMIN'

    return {
        error: null,
        members: accesses.map((a) => ({
            id: a.id,
            userId: a.userId,
            role: a.role,
            grantedAt: a.grantedAt.toISOString(),
            user: {
                id: a.user.id,
                username: a.user.username,
                nickname: a.user.nickname,
                displayName: a.user.displayName,
                email: isPrivileged ? a.user.email : null,
                avatarUrl: a.user.avatarUrl,
            },
        })),
        callerRole: role,
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Invite to profile                                                    */
/* ──────────────────────────────────────────────────────────────────── */

export async function inviteToProfileAction(
    profileId: string,
    usernameOrEmail: string,
    role: 'ADMIN' | 'USER' = 'USER',
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER hoặc ADMIN
    if (!(await canInviteMember(session.user.id, profileId))) {
        return { error: 'Bạn không có quyền mời thành viên vào Profile này.' }
    }

    const trimmed = usernameOrEmail.trim()
    if (!trimmed) return { error: 'Tên đăng nhập / email không được để trống.' }

    // Find target user
    const targetUser = await prisma.user.findFirst({
        where: {
            OR: [{ username: trimmed }, { email: trimmed }],
        },
        select: { id: true, username: true, nickname: true, displayName: true },
    })

    if (!targetUser) {
        return { error: 'Tài khoản không tồn tại.' }
    }

    if (targetUser.id === session.user.id) {
        return { error: 'Bạn đã ở trong Profile này.' }
    }

    // Check không trùng existing access
    const existing = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: targetUser.id, profileId } },
    })
    if (existing) {
        return { error: `${targetUser.displayName ?? targetUser.nickname ?? targetUser.username} đã có trong Profile này (role: ${existing.role}).` }
    }

    // Create ProfileAccess row với grantedAt = NOW → Admin cutoff applies
    await prisma.profileAccess.create({
        data: {
            userId: targetUser.id,
            profileId,
            role,
            grantedAt: new Date(),
        },
    })

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.member_invited' as any,
        targetType: 'Profile',
        targetId: profileId,
        after: { invitedUserId: targetUser.id, role },
    })

    revalidatePath('/', 'layout')
    return { success: true, member: { userId: targetUser.id, role } }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Remove from profile (OWNER only)                                     */
/* ──────────────────────────────────────────────────────────────────── */

export async function removeFromProfileAction(profileId: string, targetUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền xóa thành viên khỏi Profile.' }
    }

    if (targetUserId === session.user.id) {
        return { error: 'Bạn không thể tự xóa mình. Hãy transfer ownership trước.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        select: { role: true },
    })
    if (!targetAccess) {
        return { error: 'Thành viên không tồn tại trong Profile.' }
    }
    if (targetAccess.role === 'OWNER') {
        return { error: 'Không thể xóa OWNER khác. Profile chỉ có 1 OWNER.' }
    }

    // Find all workspaces in profile, delete WorkspaceMember rows
    const workspaces = await prisma.workspace.findMany({
        where: { profileId },
        select: { id: true },
    })
    const workspaceIds = workspaces.map((w) => w.id)

    await prisma.$transaction([
        // Delete WorkspaceMember rows in profile's workspaces
        prisma.workspaceMember.deleteMany({
            where: { userId: targetUserId, workspaceId: { in: workspaceIds } },
        }),
        // Delete ProfileAccess row
        prisma.profileAccess.delete({
            where: { userId_profileId: { userId: targetUserId, profileId } },
        }),
    ])

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.member_removed' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { removedUserId: targetUserId, role: targetAccess.role, workspaceMemberCount: workspaceIds.length },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Change member role (OWNER only)                                      */
/* ──────────────────────────────────────────────────────────────────── */

export async function changeProfileRoleAction(
    profileId: string,
    targetUserId: string,
    newRole: ProfileRole,
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canChangeMemberRole(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền đổi role thành viên.' }
    }

    if (targetUserId === session.user.id) {
        return { error: 'Bạn không thể tự đổi role của mình. Dùng transfer ownership nếu muốn giao quyền.' }
    }

    if (newRole === 'OWNER') {
        return { error: 'Để chuyển quyền OWNER, dùng transferProfileOwnership thay vì changeProfileRole.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        select: { role: true, grantedAt: true },
    })
    if (!targetAccess) {
        return { error: 'Thành viên không tồn tại trong Profile.' }
    }
    if (targetAccess.role === 'OWNER') {
        return { error: 'Không thể demote OWNER. Transfer ownership trước.' }
    }
    if (targetAccess.role === newRole) {
        return { error: 'Thành viên đã có role này.' }
    }

    // [Sprint Z] Update role + reset grantedAt if promoting USER → ADMIN
    // (so admin cutoff applies to future workspaces only)
    const shouldResetGrantedAt = targetAccess.role === 'USER' && newRole === 'ADMIN'

    await prisma.profileAccess.update({
        where: { userId_profileId: { userId: targetUserId, profileId } },
        data: {
            role: newRole,
            ...(shouldResetGrantedAt ? { grantedAt: new Date() } : {}),
        },
    })

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.role_changed' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { targetUserId, role: targetAccess.role },
        after: { targetUserId, role: newRole, grantedAtReset: shouldResetGrantedAt },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Transfer ownership (OWNER only)                                      */
/* ──────────────────────────────────────────────────────────────────── */

export async function transferProfileOwnershipAction(profileId: string, newOwnerUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    if (!(await canTransferOwnership(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền transfer ownership.' }
    }

    if (newOwnerUserId === session.user.id) {
        return { error: 'Bạn đã là Owner.' }
    }

    const targetAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: newOwnerUserId, profileId } },
        select: { role: true },
    })
    if (!targetAccess) {
        return { error: 'Người được transfer phải là thành viên hiện tại của Profile.' }
    }

    // Atomic swap: caller OWNER → ADMIN, target → OWNER
    await prisma.$transaction([
        prisma.profileAccess.update({
            where: { userId_profileId: { userId: session.user.id, profileId } },
            data: { role: 'ADMIN' },
        }),
        prisma.profileAccess.update({
            where: { userId_profileId: { userId: newOwnerUserId, profileId } },
            data: { role: 'OWNER' },
        }),
    ])

    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.ownership_transferred' as any,
        targetType: 'Profile',
        targetId: profileId,
        before: { ownerId: session.user.id },
        after: { ownerId: newOwnerUserId },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Grant workspace access to Admin (for old workspaces)                 */
/* ──────────────────────────────────────────────────────────────────── */

export async function grantWorkspaceAccessToAdmin(
    profileId: string,
    targetUserId: string,
    workspaceId: string,
) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr }

    // Gate: caller phải là OWNER
    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới có quyền cấp truy cập workspace cho Admin.' }
    }

    // Target phải là ADMIN trong profile
    const access = await getProfileAccess(targetUserId, profileId)
    if (!access) {
        return { error: 'Người dùng không thuộc Profile.' }
    }
    if (access.role !== 'ADMIN') {
        return { error: 'Chỉ Admin mới cần explicit grant workspace cũ.' }
    }

    // Workspace phải thuộc profile
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true, createdAt: true, name: true },
    })
    if (!ws || ws.profileId !== profileId) {
        return { error: 'Workspace không thuộc Profile này.' }
    }
    if (ws.createdAt >= access.grantedAt) {
        return { error: 'Workspace này đã tự động accessible cho Admin (tạo sau khi promote).' }
    }

    // Create or update WorkspaceMember
    await prisma.workspaceMember.upsert({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
        create: { userId: targetUserId, workspaceId, role: 'ADMIN' },
        update: { role: 'ADMIN' },
    })

    await audit({
        workspaceId,
        actorUserId: session.user.id,
        action: 'profile.admin_workspace_granted' as any,
        targetType: 'Workspace',
        targetId: workspaceId,
        after: { targetUserId, workspaceName: ws.name },
    })

    revalidatePath('/', 'layout')
    return { success: true }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  Get workspaces older than Admin's grantedAt (for grant UI)           */
/* ──────────────────────────────────────────────────────────────────── */

export async function getOldWorkspacesForAdmin(profileId: string, targetUserId: string) {
    const { error: authErr, session } = await requireAuthenticated()
    if (authErr || !session) return { error: authErr, workspaces: [] }

    if (!(await canRemoveMember(session.user.id, profileId))) {
        return { error: 'Chỉ Owner mới truy cập được data này.', workspaces: [] }
    }

    const access = await getProfileAccess(targetUserId, profileId)
    if (!access || access.role !== 'ADMIN') {
        return { error: 'Target không phải Admin.', workspaces: [] }
    }

    const oldWorkspaces = await prisma.workspace.findMany({
        where: { profileId, createdAt: { lt: access.grantedAt } },
        select: {
            id: true,
            name: true,
            createdAt: true,
            members: {
                where: { userId: targetUserId },
                select: { id: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    })

    return {
        error: null,
        workspaces: oldWorkspaces.map((w) => ({
            id: w.id,
            name: w.name,
            createdAt: w.createdAt.toISOString(),
            // Already granted: WorkspaceMember exists
            alreadyGranted: w.members.length > 0,
        })),
    }
}
