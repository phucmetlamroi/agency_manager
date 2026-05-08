import { logout } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'

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

    // Query workspace membership for role-based nav filtering
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
        select: { role: true },
    })
    const workspaceRole = membership?.role ?? undefined

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
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout} workspaceRole={workspaceRole}>
                <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
                {children}
            </MobileLayoutShell>
        )
    }

    // Auth Phase 3: hiển thị EmailMigrationModal nếu user cũ chưa hoàn tất migration.
    // Modal KHÔNG thể đóng — block dashboard cho đến khi user nhập email + verify.
    const needsEmailMigration = dbUser.hasCompletedEmailMigration === false

    return (
        <AdminShell user={user} workspaceId={workspaceId} viewRole="USER" workspaceRole={workspaceRole}>
            <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
            {needsEmailMigration && (
                <EmailMigrationModal displayName={displayName} />
            )}
            {children}
        </AdminShell>
    )
}
