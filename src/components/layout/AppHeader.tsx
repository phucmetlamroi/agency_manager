'use client'

// [Mobile P1 §3.5] Header 56px "root variant", partially-persistent (ẩn khi cuộn
// xuống, hiện khi cuộn lên). Nền/blur dùng token .glass-2 + z-nav + safe-area-top.
// Avatar mở account drawer (bridge PR① — port từ MobileLayoutShell; PR③ thay bằng
// AccountSheet vaul + useHistoryBackClose).
import React, { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, UserCircle, ArrowLeftRight, Settings, LogOut, Monitor, X, ScrollText, UsersRound } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { roleLabel } from '@/lib/display-labels'
import { BrandLogo } from '@/components/layout/BrandLogo'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
    user: {
        username: string
        role: string
        avatarUrl?: string
    }
    workspaceId: string
    /** Workspace-scoped role — gates admin drawer links. */
    workspaceRole?: string
    handleLogout: () => void
}

export default function AppHeader({ user, workspaceId, workspaceRole, handleLogout }: AppHeaderProps) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)
    const hidden = useScrollDirection(80)
    const isAdmin = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN'

    return (
        <>
            {/* SLIM HEADER 56px — glass-2, safe-area, partially persistent */}
            <header
                className={cn(
                    'sticky top-0 z-nav glass-2 rounded-none border-x-0 border-t-0 pt-[env(safe-area-inset-top)] transition-transform duration-300 will-change-transform',
                    hidden ? '-translate-y-full' : 'translate-y-0'
                )}
            >
                <div className="flex h-14 items-center justify-between gap-3 px-4">
                    <BrandLogo />
                    <div className="flex items-center gap-2">
                        <NotificationBell />
                        <button
                            onClick={() => setIsDrawerOpen(true)}
                            className="relative cursor-pointer group"
                            aria-label="Mở menu người dùng"
                        >
                            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white/10 group-hover:ring-primary/50 transition-all duration-300 shadow-md shadow-primary/20 bg-zinc-900">
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-primary to-primary flex items-center justify-center font-bold text-xs text-white">
                                        {user.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950 shadow-sm shadow-emerald-500/50"></div>
                        </button>
                    </div>
                </div>
            </header>

            {/* ACCOUNT DRAWER (bridge) */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-sheet flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setIsDrawerOpen(false)}
                    ></div>

                    <div className="relative w-4/5 max-w-[300px] glass-3 h-full shadow-2xl border-l border-white/10 p-6 flex flex-col pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
                        <button
                            onClick={() => setIsDrawerOpen(false)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                            aria-label="Đóng"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex flex-col items-center mt-8 mb-8">
                            <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-4 shadow-xl shadow-primary/30 ring-4 ring-primary/20 bg-zinc-900">
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-primary to-primary flex items-center justify-center text-3xl font-black text-white">
                                        {user.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <h2 className="text-xl font-bold text-zinc-100">{user.username}</h2>
                            <p className="text-sm text-muted-foreground uppercase tracking-widest">{roleLabel(user.role)}</p>
                        </div>

                        <div className="flex-1 flex flex-col gap-2">
                            <Link href={`/${workspaceId}/dashboard/errors`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold transition-all duration-300 flex items-center gap-3 border border-red-500/20">
                                <AlertTriangle className="w-4 h-4" /> Lỗi của tôi
                            </Link>
                            <Link href={`/${workspaceId}/dashboard/profile`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-200 border border-white/5">
                                <UserCircle className="w-4 h-4" /> Hồ sơ
                            </Link>
                            <Link href={`/api/profile/select`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary-accent transition-all duration-300 flex items-center gap-3 border border-primary/20">
                                <ArrowLeftRight className="w-4 h-4" /> Chuyển Team / Workspace
                            </Link>
                            {isAdmin && (
                                <>
                                    <Link href={`/${workspaceId}/admin/profile-members`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-200 border border-white/5">
                                        <UsersRound className="w-4 h-4" /> Thành viên
                                    </Link>
                                    <Link href={`/${workspaceId}/admin/audit-log`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-200 border border-white/5">
                                        <ScrollText className="w-4 h-4" /> Nhật ký hoạt động
                                    </Link>
                                    <Link href={`/${workspaceId}/admin/settings`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-200 border border-white/5">
                                        <Settings className="w-4 h-4" /> Cài đặt
                                    </Link>
                                </>
                            )}
                        </div>

                        <button
                            onClick={handleLogout}
                            className="w-full py-4 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-900/30 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer mt-auto"
                        >
                            <LogOut className="w-4 h-4" /> Đăng xuất
                        </button>

                        <form action={async () => {
                            const { toggleMobileView } = await import('@/actions/ui-actions')
                            await toggleMobileView(false)
                        }}>
                            <button className="w-full mt-4 py-2 bg-white/5 text-zinc-400 text-xs rounded-lg border border-white/10 hover:bg-white/10 hover:text-zinc-200 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer">
                                <Monitor className="w-3 h-3" /> Chuyển sang giao diện máy tính
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
