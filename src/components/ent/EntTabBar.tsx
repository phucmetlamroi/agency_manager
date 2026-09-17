'use client'

// [Giải trí] Thanh chuyển giữa hai giao diện: XEM PHIM và UP PHIM.
//
// Chỉ hiện cho người cầm mã ENT_ADMIN. Người xem không thấy thanh này — với họ
// kho phim là toàn bộ tính năng, không có dấu vết nào của trang up.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import type { EntCodeRole } from '@prisma/client'
import { Clapperboard, Upload, LogOut } from 'lucide-react'

const TABS = [
    { href: '/entertainment', label: 'Xem phim', icon: Clapperboard },
    { href: '/entertainment/upload', label: 'Up phim', icon: Upload },
] as const

export default function EntTabBar({ role }: { role: EntCodeRole }) {
    const pathname = usePathname()

    const leave = async () => {
        await fetch('/api/ent/auth/logout', { method: 'POST' })
        window.location.href = '/'
    }

    return (
        <div className="flex items-center justify-between gap-3">
            {role === 'ENT_ADMIN' ? (
                <div className="flex items-center gap-1 rounded-full border border-white/5 bg-zinc-900/40 p-1">
                    {TABS.map((tab) => {
                        const Icon = tab.icon
                        const active = pathname === tab.href
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={`relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-colors ${
                                    active ? 'text-amber-200' : 'text-zinc-400 hover:text-zinc-200'
                                }`}
                            >
                                {active && (
                                    <motion.span
                                        layoutId="ent-tab-pill"
                                        transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                                        className="absolute inset-0 rounded-full border border-amber-500/40 bg-amber-500/15"
                                    />
                                )}
                                <Icon size={13} className="relative z-10" />
                                <span className="relative z-10">{tab.label}</span>
                            </Link>
                        )
                    })}
                </div>
            ) : (
                <span />
            )}

            <button
                onClick={leave}
                title="Thoát khỏi kho phim trên máy này"
                className="flex items-center gap-2 rounded-full px-3 py-2 text-xs text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
            >
                <LogOut size={13} />
                Thoát
            </button>
        </div>
    )
}
