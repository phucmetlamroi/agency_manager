'use client'

import React from 'react'
import Link from 'next/link' // Import Link properly
import { usePathname } from 'next/navigation' // For active state if needed

export default function DesktopLayoutShell({
    children,
    user,
    handleLogout
}: {
    children: React.ReactNode,
    user: any,
    handleLogout: () => void
}) {
    const pathname = usePathname()

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-white">
            {/* DESKTOP SIDEBAR */}
            <aside className="w-64 border-r border-gray-800 p-6 flex-col hidden md:flex sticky top-0 h-screen">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
                        AGENCY TOP 1
                    </h1>
                </div>

                <nav className="flex-1 space-y-2">
                    <Link href="/dashboard" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/dashboard' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                        <span>🏠</span> Tổng quan
                    </Link>
                    {user?.role === 'ADMIN' && (
                        <>
                            <Link href="/admin" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/admin' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                                <span>⚡</span> Quản lý Task
                            </Link>
                            <Link href="/admin/users" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/admin/users' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                                <span>👥</span> Nhân sự
                            </Link>
                            <Link href="/admin/finance" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/admin/finance' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                                <span>💰</span> Tài chính
                            </Link>
                            <Link href="/admin/payroll" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/admin/payroll' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                                <span>💸</span> Payroll
                            </Link>
                            <Link href="/admin/queue" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/admin/queue' ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                                <span>🎁</span> Queue
                            </Link>
                        </>
                    )}
                </nav>

                <div className="pt-6 border-t border-gray-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center font-bold">
                            {user?.username?.[0]?.toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-sm">{user?.username}</p>
                            <p className="text-xs text-gray-500">{user?.role}</p>
                            <div className="flex items-center gap-1 bg-gray-800 rounded px-2 py-0.5 mt-1 border border-gray-700">
                                <span className="text-yellow-400 text-[10px]">★</span>
                                <span className="text-xs font-bold text-gray-300">{user?.reputation ?? 100}đ</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <button
                            onClick={handleLogout}
                            className="col-span-2 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-bold transition-all"
                        >
                            Đăng xuất
                        </button>
                        <form action={async () => {
                            const { toggleMobileView } = await import('@/actions/ui-actions')
                            await toggleMobileView(true)
                        }} className="col-span-2">
                            <button className="w-full py-2 bg-gray-800 text-gray-400 text-xs rounded-lg hover:bg-gray-700 transition-all">
                                📱 Test Mobile View
                            </button>
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
