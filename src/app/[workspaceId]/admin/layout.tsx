import { logout } from '@/lib/auth'
// Removed duplicate globals.css import
import { redirect, notFound } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import { deriveNavAccess } from '@/lib/nav-access'
import RoleWatcher from '@/components/RoleWatcher'
import AppShell from '@/components/layout/AppShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'

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

    const { status, session, dbUser } = await verifyActiveSession()

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

    // [AUDIT R8 — CRITICAL fix] Authorize via verifyProfileAdminAccess: profile-scoped
    // OWNER/ADMIN of THIS workspace (covers a profile ADMIN viewing a workspace created
    // before their grant, where verifyWorkspaceAccess downgrades them to MEMBER). The R6
    // form re-opened the cross-tenant leak it tried to close: its `catch` fallback granted
    // /admin whenever the GLOBAL isTreasurer flag was set AND *any* ProfileAccess row
    // existed — it never checked the row's ROLE, so a treasurer of profile A who was only a
    // USER/CLIENT of profile B got full /admin in B (salaries + jobPriceUSD revenue).
    // verifyProfileAdminAccess never consults the global flag and requires an OWNER/ADMIN role.
    //
    // [kiểm toán 2026-07 · S2-1] deriveNavAccess gọi ĐÚNG verifyProfileAdminAccess đó và
    // trả thêm hai cờ con (workspaceAdmin/profileAdmin) để lọc sidebar. Một lời gọi, một
    // vị từ — cổng vào vẫn y hệt trước.
    const navAccess = await deriveNavAccess(workspaceId)

    if (!navAccess.admin) {
        redirect(`/${workspaceId}/dashboard`)
    }

    const user = { username: dbUser.username, role: dbUser.role, isTreasurer: dbUser.isTreasurer, id: dbUser.id, avatarUrl: (dbUser as any).avatarUrl }

    const handleLogout = async () => {
        'use server'
        // [AUDIT HT-018 fix] Trước đây ba layout này gọi thẳng `logout()` — chỉ xoá cookie.
        // Đây KHÔNG phải đường "đá ra ngoài": nó là nút "Đăng xuất" trong AccountSheet, tức
        // đường đăng xuất của người dùng TRÊN DI ĐỘNG. Nên bấm nút đó trên điện thoại không thu
        // hồi gì, còn bấm đúng nút đó trên máy tính thì có — cùng một nhãn, hai kết cục bảo mật.
        // Nay dồn về đúng một đường /api/auth/logout (ghi nhật ký → thu hồi token → xoá cookie).
        redirect('/api/auth/logout')
    }

    // Auth Phase 3: EmailMigrationModal (blocking) nếu user cũ chưa migrate email.
    const needsEmailMigration = dbUser.hasCompletedEmailMigration === false
    const displayName = dbUser.displayName ?? user.username
    // Impersonation banner (audit fix #2.5).
    const isImpersonating = (session.user as any).isImpersonating === true
    const impersonationExpiresAt = (session.user as any).impersonationExpiresAt as string | undefined

    // [Mobile P1] AppShell hợp nhất — tự đọc getDeviceType() chọn desktop/mobile chrome.
    return (
        <AppShell user={user} workspaceId={workspaceId} workspaceRole={workspaceRole ?? undefined} navAccess={navAccess} handleLogout={handleLogout}>
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
        </AppShell>
    )
}
