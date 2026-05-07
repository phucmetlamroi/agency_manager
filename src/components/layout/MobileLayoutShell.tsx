'use client'

import React, { useState } from 'react'
import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, UserCircle, ArrowLeftRight, Bell, Settings, LogOut, Monitor, X } from 'lucide-react'

export default function MobileLayoutShell({
    children,
    user,
    handleLogout,
    workspaceId,
    workspaceRole,
}: {
    children: React.ReactNode,
    user: any,
    workspaceId: string,
    handleLogout: () => void
    /** Workspace-scoped role for nav filtering */
    workspaceRole?: string
}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // Calculate progress/stats for Header if needed?
    // User requested "Slim Header" with "Left: Logo/PageName" and "Right: Avatar -> Drawer"

    return (
        <div className="flex min-h-dvh bg-zinc-950 text-zinc-100 flex-col overflow-x-hidden font-sans">
            {/* SLIM HEADER */}
            <header className="flex items-center justify-between px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50 border-b border-white/8">
                <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-xs shadow-md shadow-indigo-500/30">
                        A
                    </div>
                    <h1 className="font-heading font-bold text-lg leading-none text-zinc-100">
                        Agency<span className="text-indigo-400">Manager</span>
                    </h1>
                </div>

                {/* Avatar Trigger */}
                <button onClick={() => setIsDrawerOpen(true)} className="relative cursor-pointer group">
                    <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center ring-2 ring-white/10 group-hover:ring-indigo-500/50 transition-all duration-300 shadow-md shadow-indigo-500/20 bg-zinc-900">
                        {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-xs text-white">
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>
                    {/* Online Status Dot */}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-950 shadow-sm shadow-emerald-500/50"></div>
                </button>
            </header>

            {/* MAIN CONTENT */}
            {/* Added pb-24 for bottom nav */}
            <main className="flex-1 p-4 pb-28 relative z-0">
                {children}
            </main>

            {/* BOTTOM NAV */}
            <BottomNav role={workspaceRole && (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN') ? 'ADMIN' : user.role} workspaceId={workspaceId} />

            {/* USER DRAWER */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                        onClick={() => setIsDrawerOpen(false)}
                    ></div>

                    {/* Drawer Content */}
                    <div className="relative w-4/5 max-w-[300px] bg-zinc-950/95 backdrop-blur-xl h-full shadow-2xl border-l border-white/10 p-6 flex flex-col">
                        <button
                            onClick={() => setIsDrawerOpen(false)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        <div className="flex flex-col items-center mt-8 mb-8">
                            <div className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center mb-4 shadow-xl shadow-indigo-500/30 ring-4 ring-indigo-500/20 bg-zinc-900">
                                {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-black text-white">
                                        {user.username?.[0]?.toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <h2 className="text-xl font-bold text-zinc-100">{user.username}</h2>
                            <p className="text-sm text-zinc-500 uppercase tracking-widest font-sans">{user.role}</p>
                        </div>

                        <div className="flex-1 flex flex-col gap-2">
                            {/* Menu Items */}
                            <Link href={`/${workspaceId}/dashboard/errors`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold transition-all duration-300 flex items-center gap-3 border border-red-500/20">
                                <AlertTriangle className="w-4 h-4" /> Hồ sơ vi phạm
                            </Link>
                            <Link href={`/${workspaceId}/dashboard/profile`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-200 border border-white/5">
                                <UserCircle className="w-4 h-4" /> Profile
                            </Link>
                            <Link href={`/${workspaceId}/admin`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition-all duration-300 flex items-center gap-3 border border-indigo-500/20">
                                <ArrowLeftRight className="w-4 h-4" /> Đổi Team / Workspace
                            </Link>
                            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-400 border border-white/5 cursor-pointer">
                                <Bell className="w-4 h-4" /> Notifications
                            </button>
                            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all duration-300 flex items-center gap-3 text-zinc-400 border border-white/5 cursor-pointer">
                                <Settings className="w-4 h-4" /> Settings
                            </button>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="w-full py-4 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-900/30 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer mt-auto"
                        >
                            <LogOut className="w-4 h-4" /> Log out
                        </button>

                        <form action={async () => {
                            const { toggleMobileView } = await import('@/actions/ui-actions')
                            await toggleMobileView(false)
                        }}>
                            <button className="w-full mt-4 py-2 bg-white/5 text-zinc-400 text-xs rounded-lg border border-white/10 hover:bg-white/10 hover:text-zinc-200 transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer">
                                <Monitor className="w-3 h-3" /> Switch to PC View
                            </button>
                        </form>

                        <div className="text-center text-xs text-zinc-700 mt-4 font-mono">
                            Version 1.3.0
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
