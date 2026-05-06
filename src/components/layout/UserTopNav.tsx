'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, AlertOctagon, UserCircle, ArrowRightLeft } from 'lucide-react'

export default function UserTopNav({ workspaceId }: { workspaceId: string }) {
    const pathname = usePathname()

    const navItems = [
        { href: `/${workspaceId}/dashboard`, icon: LayoutDashboard, label: 'Overview' },
        { href: `/${workspaceId}/dashboard/schedule`, icon: CalendarDays, label: 'Lịch làm' },
        { href: `/${workspaceId}/dashboard/errors`, icon: AlertOctagon, label: 'Lỗi cá nhân', danger: true },
        { href: `/${workspaceId}/dashboard/profile`, icon: UserCircle, label: 'Profile' }
    ]

    return (
        <nav className="desktop-menu hidden md:flex items-center gap-1.5 ml-6">
            {navItems.map((item) => {
                const isActive = pathname === item.href
                const Icon = item.icon
                
                return (
                    <Link 
                        key={item.href} 
                        href={item.href} 
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                            isActive 
                            ? (item.danger ? 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-[0_0_10px_rgba(99,102,241,0.2)]')
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5 border border-transparent'
                        }`}
                    >
                        <Icon className="w-4 h-4" />
                        {item.label}
                    </Link>
                )
            })}

            {/* Separator */}
            <div className="w-px h-5 bg-white/10 mx-2" />

            <Link
                href={`/${workspaceId}/admin`}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-all duration-200"
            >
                <ArrowRightLeft className="w-4 h-4" />
                Đổi Team
            </Link>
        </nav>
    )
}
