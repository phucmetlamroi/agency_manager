import { logout } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'

// User Layout — uses the unified AppSidebar with viewRole='USER'
// Mirrors AdminLayout structure for visual & UX parity.

export default async function UserLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const { status, session, dbUser } = await verifyActiveSession()

    if (status === 'unauthorized') {
        redirect('/login')
    }

    if (status === 'locked' || !dbUser) {
        redirect('/api/auth/logout')
    }

    const { user: sessionUser } = session
    const dbUserRole = dbUser.role

    const headersList = await headers()
    const deviceType = headersList.get('x-device-type') || 'desktop'
    const isMobile = deviceType === 'mobile'

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login')
    }

    const displayName = sessionUser.nickname || dbUser.username
    const user = {
        username: displayName,
        role: dbUser.role,
        isTreasurer: dbUser.isTreasurer ?? false,
        avatarUrl: (dbUser as any).avatarUrl,
    }

    if (isMobile) {
        const { default: MobileLayoutShell } = await import('@/components/layout/MobileLayoutShell')
        return (
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout}>
                <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
                {children}
            </MobileLayoutShell>
        )
    }

    return (
        <AdminShell user={user} workspaceId={workspaceId} viewRole="USER">
            <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
            {children}
        </AdminShell>
    )
}
