'use client'

import React from 'react'
import Link from 'next/link' 
import { usePathname } from 'next/navigation'
import { Home, ListTodo, Users, Crown, CalendarDays, Wallet, Banknote, Building2, LayoutDashboard, Gift, AlertTriangle, ArrowLeftRight, LogOut, Smartphone } from 'lucide-react'

export default function DesktopLayoutShell({
    children,
    user,
    workspaceId,
    handleLogout
}: {
    children: React.ReactNode,
    user: any,
    workspaceId: string,
    handleLogout: () => void
}) {
    const pathname = usePathname()

    return (
        <div className="flex min-h-screen bg-zinc-950 text-zinc-100 font-sans">
            {/* DESKTOP SIDEBAR */}
            <aside className="w-64 border-r border-white/10 p-6 flex-col hidden md:flex sticky top-0 h-screen bg-zinc-950/50 backdrop-blur-xl">
                <div className="mb-8">
                    <h1 className="text-2xl font-heading font-bold bg-gradient-to-r from-emerald-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-sm">
                        TOP 1
                    </h1>
                </div>

                <nav className="flex-1 space-y-2">
                    <Link href={`/${workspaceId}/dashboard`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/dashboard` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                        <Home className="w-5 h-5" /> Tổng quan
                    </Link>
                    {user?.role === 'ADMIN' && (
                        <>
                            <Link href={`/${workspaceId}/admin`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <ListTodo className="w-5 h-5" /> Quản lý Task
                            </Link>
                            <Link href={`/${workspaceId}/admin/users`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/users` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <Users className="w-5 h-5" /> Nhân sự
                            </Link>
                            <Link href={`/${workspaceId}/admin/dashboard`} className={`flex flex-col items-center justify-center p-3 rounded-2xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/dashboard` ? 'bg-indigo-600/10 text-indigo-400 font-bold border border-indigo-500/20' : 'text-zinc-400 hover:bg-white/5 border border-transparent'}`}>
                            <Crown className="w-6 h-6 mb-1 text-yellow-500" />
                            <span className="text-xs">Chủ quản</span>
                        </Link>
                            <Link href={`/${workspaceId}/admin/schedule`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/schedule` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <CalendarDays className="w-5 h-5" /> Lịch điều phối
                            </Link>
                            <Link href={`/${workspaceId}/admin/finance`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/finance` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <Banknote className="w-5 h-5" /> Tài chính
                            </Link>
                            <Link href={`/${workspaceId}/admin/payroll`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/payroll` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <Wallet className="w-5 h-5" /> Payroll
                            </Link>
                        </>
                    )}
                </nav>

                <nav className="flex-1 flex flex-col gap-2 p-4">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest pl-2 mb-2">Workspace</p>
                    <Link href={`/${workspaceId}/dashboard`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/dashboard` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                        <LayoutDashboard className="w-5 h-5" /> Overview
                    </Link>
                    {user?.role === 'ADMIN' && (
                        <>
                            <Link href={`/${workspaceId}/admin/queue`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/admin/queue` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                                <Gift className="w-5 h-5" /> Queue
                            </Link>
                        </>
                    )}
                    <Link href={`/${workspaceId}/dashboard/schedule`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/dashboard/schedule` ? 'bg-indigo-500/20 text-indigo-400 font-bold border border-indigo-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                        <CalendarDays className="w-5 h-5" /> Lịch làm việc
                    </Link>
                    <Link href={`/${workspaceId}/dashboard/errors`} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${pathname === `/${workspaceId}/dashboard/errors` ? 'bg-red-600/10 text-red-400 font-bold border border-red-500/30' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'}`}>
                        <AlertTriangle className="w-5 h-5 text-red-500" /> Hồ sơ vi phạm
                    </Link>
                </nav>

                <div className="pt-6 border-t border-white/10">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-sm text-zinc-100">{user?.username}</p>
                            <p className="text-xs text-zinc-500">{user?.role}</p>

                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <Link
                            href={`/${workspaceId}/admin`}
                            className="col-span-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 text-sm font-bold transition-all duration-300"
                        >
                            <ArrowLeftRight className="w-4 h-4" /> Đổi Team / Workspace
                        </Link>
                        <button
                            onClick={handleLogout}
                            className="col-span-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-sm font-bold transition-all duration-300"
                        >
                            <LogOut className="w-4 h-4" /> Đăng xuất
                        </button>
                        <form action={async () => {
                            const { toggleMobileView } = await import('@/actions/ui-actions')
                            await toggleMobileView(true)
                        }} className="col-span-2">
                            <button className="w-full flex items-center justify-center gap-2 py-2 bg-white/5 text-zinc-400 text-xs rounded-lg border border-white/5 hover:bg-white/10 hover:text-zinc-200 transition-all duration-300">
                                <Smartphone className="w-3 h-3" /> Test Mobile View
                            </button>
                            <div className="text-center text-[10px] text-zinc-600 mt-2 font-mono">v1.3.0</div>
                        </form>
                    </div>
                </div>
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}
