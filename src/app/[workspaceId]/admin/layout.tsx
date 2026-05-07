import { logout } from '@/lib/auth'
import Link from 'next/link'
// Removed duplicate globals.css import
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import { prisma } from '@/lib/db'

export default async function AdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const { status, session, dbUser, isAdmin } = await verifyActiveSession()

    if (status === 'unauthorized') {
        redirect('/login')
    }

    if (status === 'locked' || !dbUser) {
        redirect('/api/auth/logout')
    }

    // Workspace-scoped authorization: allow access if user is
    // (a) global ADMIN/treasurer, OR (b) OWNER/ADMIN of this workspace.
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
        select: { role: true },
    })
    const workspaceRole = membership?.role ?? null
    const canAccessAdmin = isAdmin || workspaceRole === 'OWNER' || workspaceRole === 'ADMIN'

    if (!canAccessAdmin) {
        redirect(`/${workspaceId}/dashboard`)
    }

    const user = { username: dbUser.username, role: dbUser.role, isTreasurer: dbUser.isTreasurer, id: dbUser.id, avatarUrl: (dbUser as any).avatarUrl }

    const headersList = await headers()
    const deviceType = headersList.get('x-device-type') || 'desktop'
    const isMobile = deviceType === 'mobile'

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login')
    }

    if (isMobile) {
        const { default: MobileLayoutShell } = await import('@/components/layout/MobileLayoutShell')
        return (
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout} workspaceRole={workspaceRole ?? undefined}>
                <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
                {children}
            </MobileLayoutShell>
        )
    }

    return (
        <AdminShell user={user} workspaceId={workspaceId} workspaceRole={workspaceRole ?? undefined}>
            <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
            {children}
        </AdminShell>
    )
}
