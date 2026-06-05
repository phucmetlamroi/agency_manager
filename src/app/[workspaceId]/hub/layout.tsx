import { logout } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import MobileLayoutShell from '@/components/layout/MobileLayoutShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'
import { isMobileDevice } from '@/lib/device'
import { hasAtLeastRole } from '@/lib/workspace-roles'

const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

/**
 * [Chat] Layout for /[workspaceId]/hub. Mirrors admin/layout.tsx so the Chat surface
 * keeps the global Sidebar + chrome, BUT gates to MEMBER role (not OWNER/ADMIN) —
 * Chat is intentionally for ALL staff (USER+). Sets `viewRole` so the sidebar's
 * Dashboard link points the right place (USER → /dashboard, ADMIN → /admin).
 */
export default async function HubLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params

    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
        notFound()
    }

    const { status, session, dbUser, isAdmin } = await verifyActiveSession()

    if (status === 'unauthorized') {
        redirect('/login')
    }
    if (status === 'locked' || !dbUser) {
        redirect('/api/auth/logout')
    }

    // Workspace MEMBER+ may use Chat (CLIENT is bounced to /portal upstream by the
    // workspace layout; this is just defence-in-depth).
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
        select: { role: true },
    })
    const workspaceRole = membership?.role ?? null
    const isMember = isAdmin || (workspaceRole != null && hasAtLeastRole(workspaceRole, 'MEMBER'))
    if (!isMember) {
        redirect(`/${workspaceId}/dashboard`)
    }

    // Drive AppSidebar nav: workspace ADMIN/OWNER → admin view; plain MEMBER → user view.
    const viewRole: 'ADMIN' | 'USER' =
        isAdmin || workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' ? 'ADMIN' : 'USER'

    const user = {
        username: dbUser.username,
        role: dbUser.role,
        isTreasurer: dbUser.isTreasurer,
        id: dbUser.id,
        avatarUrl: (dbUser as any).avatarUrl,
    }

    const isMobile = await isMobileDevice()

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login')
    }

    if (isMobile) {
        return (
            <MobileLayoutShell user={user} workspaceId={workspaceId} handleLogout={handleLogout} workspaceRole={workspaceRole ?? undefined}>
                <RoleWatcher currentRole={viewRole} isTreasurer={user.isTreasurer} />
                {children}
            </MobileLayoutShell>
        )
    }

    const needsEmailMigration = dbUser.hasCompletedEmailMigration === false
    const displayName = dbUser.displayName ?? user.username
    const isImpersonating = (session.user as any).isImpersonating === true
    const impersonationExpiresAt = (session.user as any).impersonationExpiresAt as string | undefined

    return (
        <AdminShell user={user} workspaceId={workspaceId} viewRole={viewRole} workspaceRole={workspaceRole ?? undefined}>
            <RoleWatcher currentRole={viewRole} isTreasurer={user.isTreasurer} />
            {needsEmailMigration && <EmailMigrationModal displayName={displayName} />}
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
