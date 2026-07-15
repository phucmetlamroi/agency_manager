'use server'

import { redirect } from 'next/navigation'
import { getSession, createImpersonationSession, stopImpersonationSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { audit } from '@/lib/audit-log'
import { verifyWorkspaceAccess } from '@/lib/security'

export async function startImpersonation(targetUserId: string, workspaceId: string) {
    // [AUDIT R1 — CRITICAL fix] Was gated only on the legacy global role==='ADMIN'
    // with NO scope check on the target → cross-tenant account takeover. Now require
    // the caller to be a workspace ADMIN, the target to be a member of THIS
    // workspace, and forbid impersonating a (legacy) global-admin account.
    const { workspaceRole: callerRole } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    const session = await getSession()
    if (!session?.user) throw new Error('Unauthorized')

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { userId: targetUserId, workspaceId },
        select: { role: true },
    })
    if (!targetMember) throw new Error('Người này không thuộc workspace của bạn.')

    // [AUDIT R6 — CRITICAL fix] Block role-rank escalation. Previously the ONLY
    // target guard was the legacy global `User.role === 'ADMIN'` — which a normal
    // profile OWNER does NOT have — so a mere workspace/profile ADMIN could
    // impersonate the OWNER and then transfer ownership / mint admins / evict the
    // owner = full single-tenant takeover. Resolve the target's EFFECTIVE role
    // (WorkspaceMember + ProfileAccess): never impersonate an OWNER, and only an
    // OWNER may impersonate an ADMIN.
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    const targetPa = ws?.profileId
        ? await prisma.profileAccess.findUnique({
              where: { userId_profileId: { userId: targetUserId, profileId: ws.profileId } },
              select: { role: true },
          })
        : null
    const targetIsOwner = targetMember.role === 'OWNER' || targetPa?.role === 'OWNER'
    const targetIsAdmin = targetMember.role === 'ADMIN' || targetPa?.role === 'ADMIN'
    if (targetIsOwner) throw new Error('Không thể đóng vai chủ sở hữu Workspace.')
    if (targetIsAdmin && callerRole !== 'OWNER') throw new Error('Chỉ chủ sở hữu mới được đóng vai quản trị viên.')

    // [AUDIT HT-003/004 fix] The impersonation session is GLOBAL — the cookie overrides the
    // caller's identity EVERYWHERE, not only this workspace. So even when the target is merely a
    // MEMBER here, impersonating them grants the caller ALL of the target's access in OTHER
    // tenants — including any profile/workspace where the target is OWNER/ADMIN → cross-tenant
    // takeover. Refuse to impersonate anyone elevated OUTSIDE the current profile.
    const currentProfileId = ws?.profileId ?? null
    const [otherProfileRoles, targetMemberships] = await Promise.all([
        prisma.profileAccess.findMany({
            where: currentProfileId
                ? { userId: targetUserId, profileId: { not: currentProfileId } }
                : { userId: targetUserId },
            select: { role: true },
        }),
        prisma.workspaceMember.findMany({
            where: { userId: targetUserId },
            select: { role: true, workspace: { select: { profileId: true } } },
        }),
    ])
    const elevatedElsewhere =
        otherProfileRoles.some((r) => r.role === 'OWNER' || r.role === 'ADMIN') ||
        targetMemberships.some(
            (m) =>
                (m.role === 'OWNER' || m.role === 'ADMIN') &&
                m.workspace?.profileId != null &&
                m.workspace.profileId !== currentProfileId,
        )
    if (elevatedElsewhere) {
        throw new Error('Không thể đóng vai người dùng có quyền quản trị ở workspace/hồ sơ khác.')
    }

    const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
            id: true,
            username: true,
            nickname: true,
            role: true,
            email: true,
        } // Only passing essential info
    })

    if (!targetUser) throw new Error('User not found')
    if (targetUser.role === 'ADMIN') throw new Error('Không thể đóng vai tài khoản quản trị.')

    await createImpersonationSession(session.user, targetUser)

    // AUDIT: impersonation is a privileged op — always log.
    await audit({
        workspaceId,
        actorUserId: session.user.id,
        action: 'auth.impersonation_started',
        targetType: 'User',
        targetId: targetUser.id,
        after: { targetUsername: targetUser.username, targetRole: targetUser.role },
    })

    // [Canonical Clients] CLIENT impersonation target removed with the
    // account portal — clients use public /share links now. Any remaining
    // CLIENT rows land on the workspace root like staff (harmless).
    const dest = `/${workspaceId}`
    redirect(dest)
}

export async function stopImpersonation(workspaceId: string) {
    const session = await getSession()
    await stopImpersonationSession()

    // AUDIT: impersonation end (best-effort — session may already be cleared).
    if (session?.user?.id) {
        await audit({
            workspaceId,
            actorUserId: session.user.id,
            action: 'auth.impersonation_ended',
            targetType: 'User',
            targetId: session.user.id,
        })
    }

    // Go back to the analytics page where they started
    redirect(`/${workspaceId}/admin/analytics`)
}
