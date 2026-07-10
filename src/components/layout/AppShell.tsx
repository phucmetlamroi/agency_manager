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
    handleLogout: () => void
}

export default async function AppShell({
    children,
    user,
    workspaceId,
    viewRole = 'ADMIN',
    workspaceRole,
    handleLogout,
}: AppShellProps) {
    const deviceType = await getDeviceType()

    if (deviceType === 'desktop') {
        return (
            <AppShellDesktop user={user} workspaceId={workspaceId} viewRole={viewRole} workspaceRole={workspaceRole}>
                {children}
            </AppShellDesktop>
        )
    }

    // Mobile — nav role: workspace OWNER/ADMIN → 'ADMIN', ngược lại global role (giữ
    // đúng logic MobileLayoutShell cũ để BottomNav trỏ đúng nhánh admin/user).
    const navRole = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN' ? 'ADMIN' : user.role

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background text-foreground">
            <AppHeader user={user} workspaceId={workspaceId} workspaceRole={workspaceRole} handleLogout={handleLogout} />
            <main className="flex-1 px-4 pt-4 pb-[calc(64px+env(safe-area-inset-bottom)+16px)]">
                {children}
            </main>
            <BottomNav role={navRole} workspaceId={workspaceId} />
        </div>
    )
}
