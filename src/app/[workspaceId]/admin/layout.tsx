import { logout } from '@/lib/auth'
import Link from 'next/link'
// Removed duplicate globals.css import
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'

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
        // Trực tiếp clear cookie và đuổi ra ngoài login 
        redirect('/api/auth/logout')
    }

    // Robust Authorization: Ensure user is strictly an ADMIN
    if (!isAdmin) {
        redirect(`/${workspaceId}/dashboard`)
    }

    const user = { username: dbUser.username, role: dbUser.role, isTreasurer: dbUser.isTreasurer, id: dbUser.id }

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
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout}>
                <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
                {children}
            </MobileLayoutShell>
        )
    }

    return (
        <AdminShell user={user} workspaceId={workspaceId}>
            <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
            {children}
        </AdminShell>
    )
}
