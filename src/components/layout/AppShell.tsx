// [Mobile P1 §3.3 — công tắc lớn] Shell responsive HỢP NHẤT duy nhất.
// Server Component: đọc getDeviceType() 1 lần (header x-device-type do middleware set)
// → desktop nhận AppShellDesktop (y hệt AdminShell cũ, BẤT BIẾN nhìn); mobile nhận
// AppHeader 56px + BottomNav + main safe-area. Thay MobileLayoutShell/DesktopLayoutShell/
// AdminShell (đã xóa). Modal/banner truyền qua children → render trên cả 2 nhánh.
import * as React from 'react'
import { getDeviceType } from '@/lib/device'
import { AppShellDesktop } from './AppShellDesktop'
import AppHeader from './AppHeader'
import BottomNav from '@/components/BottomNav'
import type { NavAccess } from '@/lib/nav-access'

interface AppShellProps {
    children: React.ReactNode
    user: {
        username: string
        role: string
        isTreasurer?: boolean
        avatarUrl?: string
    }
    workspaceId: string
    viewRole?: 'ADMIN' | 'USER'
    /** Workspace-scoped role (OWNER/ADMIN/…) — lọc nav + gate admin drawer links. */
    workspaceRole?: string
    /** [kiểm toán 2026-07 · S2-1] Quyền điều hướng tính ở layout (deriveNavAccess). */
    navAccess?: NavAccess
    handleLogout: () => void
}

export default async function AppShell({
    children,
    user,
    workspaceId,
    viewRole = 'ADMIN',
    workspaceRole,
    navAccess,
    handleLogout,
}: AppShellProps) {
    const deviceType = await getDeviceType()

    if (deviceType === 'desktop') {
        return (
            <AppShellDesktop user={user} workspaceId={workspaceId} viewRole={viewRole} workspaceRole={workspaceRole} navAccess={navAccess}>
                {children}
            </AppShellDesktop>
        )
    }

    // [kiểm toán 2026-07 · S2-1] Bộ tab dưới cùng chọn theo ĐÚNG cổng /admin.
    // Logic cũ (giữ từ MobileLayoutShell) có nhánh dự phòng `user.role` — vai trò TOÀN CỤC.
    // Hệ quả: một quản trị viên của tổ chức KHÁC, ở đây chỉ là thành viên thường, nhận
    // nguyên bộ ADMIN_TABS mà cả 5 tab đều trỏ /admin/** → chạm tab nào cũng bị đá về
    // /dashboard. Thiếu navAccess thì giữ nguyên hành vi cũ.
    const navRole = navAccess
        ? (navAccess.admin ? 'ADMIN' : 'USER')
        : (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' ? 'ADMIN' : user.role)

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
            <AppHeader user={user} workspaceId={workspaceId} workspaceRole={workspaceRole} navAccess={navAccess} handleLogout={handleLogout} />
            <main className="flex-1 px-4 pt-4 pb-[calc(64px+env(safe-area-inset-bottom)+16px)]">
                {children}
            </main>
            <BottomNav role={navRole} workspaceId={workspaceId} />
        </div>
    )
}
