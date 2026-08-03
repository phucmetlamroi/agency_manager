import { logout } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import AppShell from '@/components/layout/AppShell'
import { prisma } from '@/lib/db'
import EmailMigrationModal from '@/components/auth/EmailMigrationModal'
import ImpersonationBannerWrapper from '@/components/admin/ImpersonationBannerWrapper'
import BillingStatusBanner from '@/components/billing/BillingStatusBanner'
import { deriveNavAccess } from '@/lib/nav-access'

// [Workspace ID] Permissive regex — allows UUID format AND legacy slug IDs
// (vd: 'legacy-feb-2026', 'legacy-mar-2026' của Hustly Team profile được migrate
// từ legacy data). Strict UUID check trước đây block 404 cho 2 workspace này.
// Vẫn reject file paths (có dấu chấm) như '/icon.png/dashboard' từ PWA scan.
const WORKSPACE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

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

    // Query workspace membership for role-based nav filtering.
    // [kiểm toán 2026-07 · S2-1 / Q1] deriveNavAccess chạy SONG SONG — đây là vỏ mà
    // editor sống trong đó, nên cũng là nơi 9 mục /admin/** từng đá họ đi không một lời.
    const [membership, navAccess] = await Promise.all([
        prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
            select: { role: true },
        }),
        deriveNavAccess(workspaceId),
    ])
    const workspaceRole = membership?.role ?? undefined

    // [Sprint B] Trial banner removed.

    const handleLogout = async () => {
        'use server'
        // [AUDIT HT-018 fix] Trước đây ba layout này gọi thẳng `logout()` — chỉ xoá cookie.
        // Đây KHÔNG phải đường "đá ra ngoài": nó là nút "Đăng xuất" trong AccountSheet, tức
        // đường đăng xuất của người dùng TRÊN DI ĐỘNG. Nên bấm nút đó trên điện thoại không thu
        // hồi gì, còn bấm đúng nút đó trên máy tính thì có — cùng một nhãn, hai kết cục bảo mật.
        // Nay dồn về đúng một đường /api/auth/logout (ghi nhật ký → thu hồi token → xoá cookie).
        redirect('/api/auth/logout')
    }

    const displayName = sessionUser.nickname || dbUser.username
    const user = {
        username: displayName,
        role: dbUser.role,
        isTreasurer: dbUser.isTreasurer ?? false,
        avatarUrl: (dbUser as any).avatarUrl,
    }

    // Auth Phase 3: EmailMigrationModal (blocking) nếu user cũ chưa migrate email.
    const needsEmailMigration = dbUser.hasCompletedEmailMigration === false
    // Impersonation banner (audit fix #2.5).
    const isImpersonating = (sessionUser as any).isImpersonating === true
    const impersonationExpiresAt = (sessionUser as any).impersonationExpiresAt as string | undefined

    // [Mobile P1] AppShell hợp nhất — tự đọc getDeviceType() chọn desktop/mobile chrome.
    return (
        <AppShell user={user} workspaceId={workspaceId} viewRole="USER" workspaceRole={workspaceRole} navAccess={navAccess} handleLogout={handleLogout}>
            <RoleWatcher currentRole={dbUserRole} isTreasurer={dbUser.isTreasurer ?? false} />
            {/* [BILLING P5] Editor không sửa được billing nhưng PHẢI hiểu vì sao nút ghi từ chối
                khi tổ chức hết hạn — banner là lời giải thích, link trỏ trang Gói cước (admin xử lý). */}
            <BillingStatusBanner workspaceId={workspaceId} />
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
