import { logout } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import { AdminShell } from '@/components/layout/AdminShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'
import { isMobileDevice } from '@/lib/device'

const WORKSPACE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

    // Reject non-UUID workspaceIds (e.g. /icon.png/dashboard từ PWA scan)
    if (!WORKSPACE_ID_PATTERN.test(workspaceId)) {
        notFound()
    }

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

    // [Sprint B] Trial banner removed.

    // Mobile detection: dùng helper isMobileDevice() (user-agent + cookie 'view-mode' override).
    // Trước đây dùng header 'x-device-type' nhưng middleware không bao giờ set →
    // mobile users luôn nhận desktop AdminShell thay vì MobileLayoutShell.
    const isMobile = await isMobileDevice()

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

    // Impersonation banner: hiển thị nếu admin đang impersonate (audit fix #2.5)
    const isImpersonating = (sessionUser as any).isImpersonating === true
    const impersonationExpiresAt = (sessionUser as any).impersonationExpiresAt as string | undefined

    return (
        <AdminShell user={user} workspaceId={workspaceId} viewRole="USER" workspaceRole={workspaceRole}>
            <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
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
