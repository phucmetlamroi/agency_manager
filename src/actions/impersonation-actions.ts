'use server'

import { redirect } from 'next/navigation'
import { getSession, createImpersonationSession, stopImpersonationSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function startImpersonation(targetUserId: string, workspaceId: string) {
    const session = await getSession()
    
    // Security check: Only Admins can impersonate
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

    // Redirect to the workspace root or their specific dashboard
    // Depending on their role, let's just go to the portal root for that workspace
    const dest = `/${workspaceId}`
    redirect(dest)
}

export async function stopImpersonation(workspaceId: string) {
    await stopImpersonationSession()
    // Go back to the analytics page where they started
    redirect(`/${workspaceId}/admin/analytics`)
}
