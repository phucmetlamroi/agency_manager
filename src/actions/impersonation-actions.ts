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
    await verifyWorkspaceAccess(workspaceId, 'ADMIN')
    const session = await getSession()
    if (!session?.user) throw new Error('Unauthorized')

    const targetMember = await prisma.workspaceMember.findFirst({
        where: { userId: targetUserId, workspaceId },
        select: { id: true },
    })
    if (!targetMember) throw new Error('Người này không thuộc workspace của bạn.')

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
