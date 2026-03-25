'use client'

import React, { useState } from 'react'
import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function MobileLayoutShell({
    children,
    user,
    handleLogout,
    workspaceId
}: {
    children: React.ReactNode,
    user: any,
    workspaceId: string,
    handleLogout: () => void
}) {
    const [isDrawerOpen, setIsDrawerOpen] = useState(false)

    // Calculate progress/stats for Header if needed?
    // User requested "Slim Header" with "Left: Logo/PageName" and "Right: Avatar -> Drawer"

    return (
        <div className="flex min-h-dvh bg-[#111111] text-white flex-col overflow-x-hidden">
            {/* SLIM HEADER - Improved for iOS Safe Areas */}
            <header className="flex items-center justify-between px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top))] bg-black/90 backdrop-blur-xl sticky top-0 z-50 border-b border-white/5">
                <div className="flex items-center gap-2">
                    <span className="text-xl">🚀</span>
                    <h1 className="font-bold text-lg leading-none bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                        Agency<span className="text-white">Manager</span>
                    </h1>
                </div>

                {/* Avatar Trigger */}
                <button onClick={() => setIsDrawerOpen(true)} className="relative">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center font-bold text-xs ring-2 ring-white/10">
                        {user.username?.[0]?.toUpperCase()}
                    </div>
                    {/* Status Dot */}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black"></div>
                </button>
            </header>

            {/* MAIN CONTENT */}
            {/* Added pb-24 for bottom nav */}
            <main className="flex-1 p-4 pb-28 relative z-0">
                {children}
            </main>

            {/* BOTTOM NAV */}
            <BottomNav role={user.role} workspaceId={workspaceId} />

            {/* USER DRAWER (Slide from Right or Bottom?) 
                User requested "Menu trượt (Drawer/Modal)". Slide from Right is standard for Profile.
            */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
                        onClick={() => setIsDrawerOpen(false)}
                    ></div>

                    {/* Drawer Content */}
                    <div className="relative w-4/5 max-w-[300px] bg-[#1a1a1a] h-full shadow-2xl border-l border-white/10 animate-slide-in-right p-6 flex flex-col">
                        <button
                            onClick={() => setIsDrawerOpen(false)}
                            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center bg-white/5 rounded-full text-gray-400"
                        >
                            ×
                        </button>

                        <div className="flex flex-col items-center mt-8 mb-8">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-3xl font-bold mb-4 shadow-lg shadow-purple-500/20">
                                {user.username?.[0]?.toUpperCase()}
                            </div>
                            <h2 className="text-xl font-bold">{user.username}</h2>
                            <p className="text-sm text-gray-400 uppercase tracking-widest">{user.role}</p>

                            <div className="mt-4 px-4 py-2 bg-white/5 rounded-full border border-white/10 flex items-center gap-2">
                                <span className="text-yellow-400">★</span>
                                <span className="font-bold">{user.reputation ?? 100} Reputation</span>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col gap-2">
                            {/* Menu Items */}
                            <Link href={`/${workspaceId}/dashboard/errors`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold transition-colors flex items-center gap-3">
                                <span>⚠️</span> Hồ sơ vi phạm
                            </Link>
                            <Link href={`/${workspaceId}/dashboard/profile`} onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-3">
                                <span>👤</span> Profile
                            </Link>
                            <Link href="/profile" onClick={() => setIsDrawerOpen(false)} className="w-full text-left px-4 py-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors flex items-center gap-3 border border-blue-500/20">
                                <span>🔄</span> Đổi Team / Workspace
                            </Link>
                            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-3">
                                <span>🔔</span> Notifications
                            </button>
                            <button className="w-full text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-3">
                                <span>⚙️</span> Settings
                            </button>
                        </div>

                        <button
                            onClick={handleLogout}
                            className="w-full py-4 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-transform mt-auto"
                        >
                            Log out
                        </button>

                        <form action={async () => {
                            const { toggleMobileView } = await import('@/actions/ui-actions')
                            await toggleMobileView(false)
                        }}>
                            <button className="w-full mt-4 py-2 bg-gray-800 text-gray-400 text-xs rounded-lg border border-gray-700">
                                🖥️ Switch to PC View
                            </button>
                        </form>

                        <div className="text-center text-xs text-gray-600 mt-4">
                            Version 1.3.0 (Live - 17:45)
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
