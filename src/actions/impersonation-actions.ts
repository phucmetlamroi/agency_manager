'use server'

import { redirect } from 'next/navigation'
import { getSession, createImpersonationSession, stopImpersonationSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { audit } from '@/lib/audit-log'

export async function startImpersonation(targetUserId: string, workspaceId: string) {
    const session = await getSession()

    // Security check: Only global Admins can impersonate (legitimately global).
    if (!session || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized')
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

    // Redirect based on target role
    if (targetUser.role === 'CLIENT') {
        redirect(`/portal/en/${workspaceId}/tasks`)
    }

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
