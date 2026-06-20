import { logout } from '@/lib/auth'
// Removed duplicate globals.css import
import { redirect, notFound } from 'next/navigation'
import { verifyActiveSession, verifyWorkspaceAccess } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import MobileLayoutShell from '@/components/layout/MobileLayoutShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'
import { isMobileDevice } from '@/lib/device'

// [Workspace ID] Permissive regex — allows UUID format AND legacy slug IDs
// (vd: 'legacy-feb-2026', 'legacy-mar-2026' của Hustly Team profile được migrate
// từ legacy data). Strict UUID check trước đây block 404 cho 2 workspace này.
// Vẫn reject file paths (có dấu chấm) như '/icon.png/admin' từ PWA scan.
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

export default async function AdminLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params

    // Reject non-UUID workspaceIds (e.g. /icon.png/admin từ PWA scan)
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

    // workspaceRole (from the explicit WorkspaceMember row) drives the nav shells.
    const membership = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
        select: { role: true },
    })
    const workspaceRole = membership?.role ?? null

    // [AUDIT R6 — CRITICAL fix] The previous gate `isAdmin || workspaceRole === …`
    // honored the GLOBAL isTreasurer flag (isAdmin) as a cross-tenant grant: a
    // treasurer of profile A could open profile B's /admin/payroll and read its
    // salaries. Authorize via the hardened verifyWorkspaceAccess (ProfileAccess +
    // WorkspaceMember, which deliberately does NOT honor the global flag). A
    // treasurer keeps finance access ONLY inside a profile they actually belong to.
    let canAccessAdmin = false
    try {
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        canAccessAdmin = true
    } catch {
        if (isAdmin) {
            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { profileId: true },
            })
            if (ws?.profileId) {
                const pa = await prisma.profileAccess.findUnique({
                    where: { userId_profileId: { userId: dbUser.id, profileId: ws.profileId } },
                    select: { role: true },
                })
                if (pa) canAccessAdmin = true
            }
        }
    }

    if (!canAccessAdmin) {
        redirect(`/${workspaceId}/dashboard`)
    }

    const user = { username: dbUser.username, role: dbUser.role, isTreasurer: dbUser.isTreasurer, id: dbUser.id, avatarUrl: (dbUser as any).avatarUrl }

    // Mobile detection via user-agent + cookie override (xem src/lib/device.ts).
    const isMobile = await isMobileDevice()

    const handleLogout = async () => {
        'use server'
        await logout()
        redirect('/login')
    }

    if (isMobile) {
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
