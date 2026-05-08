import { logout } from '@/lib/auth'
import Link from 'next/link'
// Removed duplicate globals.css import
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'

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

    // Auth Phase 3: hiển thị EmailMigrationModal nếu user cũ chưa hoàn tất migration
    const needsEmailMigration = dbUser.hasCompletedEmailMigration === false
    const displayName = dbUser.displayName ?? user.username

    // [Sprint B] Trial banner removed.

    // Impersonation banner: audit fix #2.5
    const isImpersonating = (session.user as any).isImpersonating === true
    const impersonationExpiresAt = (session.user as any).impersonationExpiresAt as string | undefined

    return (
        <AdminShell user={user} workspaceId={workspaceId} workspaceRole={workspaceRole ?? undefined}>
            <RoleWatcher currentRole="ADMIN" isTreasurer={user.isTreasurer} />
            {needsEmailMigration && (
                <EmailMigrationModal displayName={displayName} />
            )}
            {isImpersonating && impersonationExpiresAt && (
                <ImpersonationBannerWrapper
                    impersonatedUsername={displayName}
                    expiresAtIso={impersonationExpiresAt}
                    workspaceId={workspaceId}
                />
            )}
            {children}
        </AdminShell>
    )
}
