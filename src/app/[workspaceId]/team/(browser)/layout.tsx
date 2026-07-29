// [review-fixes P1] Chrome cho các trang duyệt "Tệp" (browser/folder/shares/trash).
// Route group (browser) → KHÔNG áp cho route player asset/[assetId] (nó full-bleed, sửa B9).
// Membership đã được ../layout.tsx gate; đây chỉ dựng AppShell (hợp nhất, P1) + chọn
// viewRole theo quyền admin WORKSPACE (admin thấy nav ADMIN, editor thấy nav USER). KHÔNG
// redirect non-admin (đó là lỗi gốc B2/B3/B9). RoleWatcher.currentRole = role GLOBAL (khớp
// /api/auth/role) để không lặp refresh; viewRole (workspace-scoped) chỉ dùng lọc nav.
import { redirect } from 'next/navigation'
import { logout } from '@/lib/auth'
import { verifyActiveSession } from '@/lib/security'
import RoleWatcher from '@/components/RoleWatcher'
import AppShell from '@/components/layout/AppShell'
import { prisma } from '@/lib/db'
import { deriveNavAccess } from '@/lib/nav-access'

export default async function TeamBrowserLayout({
    children,
    params,
}: {
    children: React.ReactNode
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params

    // Defense-in-depth (../layout.tsx already gated membership) — needed here for the user
    // object the shell renders.
    const { status, dbUser } = await verifyActiveSession()
    if (status === 'unauthorized' || !dbUser) redirect('/login')
    if (status === 'locked') redirect('/api/auth/logout')

    const [membership, navAccess] = await Promise.all([
        prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId: dbUser.id, workspaceId } },
            select: { role: true },
        }),
        // [kiểm toán 2026-07 · S2-1] Cùng verifyProfileAdminAccess như trước, chỉ khác là
        // giữ lại kết quả để lọc sidebar thay vì vứt đi.
        deriveNavAccess(workspaceId),
    ])
    const workspaceRole = membership?.role ?? null

    // Workspace-scoped admin → nav viewRole (KHÔNG dùng global User.role cho nav).
    const viewRole: 'ADMIN' | 'USER' = navAccess.admin ? 'ADMIN' : 'USER'

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

    // [Mobile P1] AppShell hợp nhất — tự đọc getDeviceType() chọn desktop/mobile chrome.
    return (
        <AppShell user={user} workspaceId={workspaceId} viewRole={viewRole} workspaceRole={workspaceRole ?? undefined} navAccess={navAccess} handleLogout={handleLogout}>
            <RoleWatcher currentRole={dbUser.role} isTreasurer={user.isTreasurer} />
            {children}
        </AppShell>
    )
}
