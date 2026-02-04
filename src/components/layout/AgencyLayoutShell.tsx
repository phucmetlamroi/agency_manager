'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AgencyLayoutShell({
    children,
    user,
    agency,
    handleLogout
}: {
    children: React.ReactNode,
    user: any,
    agency: any,
    handleLogout: () => void
}) {
    const pathname = usePathname()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    // Close menu when route changes
    useEffect(() => {
        setIsMobileMenuOpen(false)
    }, [pathname])

    const NavContent = () => (
        <>
            <div className="mb-8">
                <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">
                    AGENCY PORTAL
                </h1>
                <div className="text-xs text-gray-500 mt-1 font-mono">{agency?.name}</div>
            </div>

            <nav className="flex-1 space-y-2">
                <Link href="/agency" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/agency' ? 'bg-purple-600/10 text-purple-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                    <span>📊</span> Tổng quan
                </Link>
                <Link href="/agency/tasks" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/agency/tasks' ? 'bg-purple-600/10 text-purple-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                    <span>⚡</span> Kho việc (Task Pool)
                </Link>
                <Link href="/agency/members" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/agency/members' ? 'bg-purple-600/10 text-purple-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                    <span>👥</span> Nhân sự
                </Link>
                <Link href="/agency/finance" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${pathname === '/agency/finance' ? 'bg-purple-600/10 text-purple-400 font-bold' : 'text-gray-400 hover:bg-white/5'}`}>
                    <span>💰</span> Tài chính
                </Link>
            </nav>

            <div className="pt-6 border-t border-gray-800">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white">
                        {user?.username?.[0]?.toUpperCase()}
                    </div>
                    <div>
                        <p className="font-bold text-sm text-white">{user?.username}</p>
                        <p className="text-xs text-gray-500">Agency Admin</p>
                    </div>
                </div>

                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-sm font-bold transition-all"
                >
                    Đăng xuất
                </button>

                <Link href="/dashboard" className="block mt-2 text-center text-xs text-gray-600 hover:text-gray-400">
                    &larr; Quay lại User Dashboard
                </Link>
            </div>
        </>
    )

    return (
        <div className="flex min-h-screen bg-[#0a0a0a] text-white flex-col md:flex-row">
            {/* MOBILE HEADER */}
            <header className="md:hidden flex items-center justify-between p-4 border-b border-gray-800 bg-[#0a0a0a] sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white text-xs">
                        AG
                    </div>
                    <span className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
                        {agency?.code}
                    </span>
                </div>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-gray-400 hover:text-white"
                >
                    {isMobileMenuOpen ? '✕' : '☰'}
                </button>
            </header>

            {/* MOBILE DRAWER OVERLAY */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-40 md:hidden flex">
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsMobileMenuOpen(false)} />

                    {/* Drawer Content */}
                    <aside className="relative w-[80%] max-w-[300px] h-full bg-[#111] border-r border-gray-800 p-6 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
                        <NavContent />
                    </aside>
                </div>
            )}

            {/* DESKTOP SIDEBAR */}
            <aside className="w-64 border-r border-gray-800 p-6 flex-col hidden md:flex sticky top-0 h-screen">
                <NavContent />
            </aside>

            {/* MAIN CONTENT */}
            <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
                {children}
            </main>
        </div>
    )
}
