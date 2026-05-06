'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, Users, CalendarDays, Wallet, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function BottomNav({ role, workspaceId }: { role: string, workspaceId: string }) {
    const pathname = usePathname()
    const isActive = (path: string) => pathname === path

    const navItems = [
        {
            href: `/${workspaceId}/dashboard`,
            label: 'Home',
            icon: Home,
            show: true,
        },
        {
            href: role === 'ADMIN' ? `/${workspaceId}/admin` : `/${workspaceId}/dashboard`,
            label: 'Tasks',
            icon: ClipboardList,
            show: true,
        },
        {
            href: `/${workspaceId}/admin/users`,
            label: 'Users',
            icon: Users,
            show: role === 'ADMIN',
        },
        {
            href: `/${workspaceId}/admin/chat`,
            label: 'Chat',
            icon: MessageSquare,
            show: true,
        },
        {
            href: role === 'ADMIN' ? `/${workspaceId}/admin/schedule` : `/${workspaceId}/dashboard/schedule`,
            label: 'Lịch',
            icon: CalendarDays,
            show: true,
        },
        {
            href: role === 'ADMIN' ? `/${workspaceId}/admin/payroll` : `/${workspaceId}/dashboard`,
            label: role === 'ADMIN' ? 'Payroll' : 'Income',
            icon: Wallet,
            show: true,
        },
    ].filter(item => item.show)

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 py-2 pb-[calc(8px+env(safe-area-inset-bottom))] bg-zinc-950/90 backdrop-blur-xl border-t border-white/10 flex items-center justify-around z-50 shadow-[0_-8px_32px_rgba(0,0,0,0.4)]">
            {navItems.map(item => {
                const active = isActive(item.href)
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-300 min-w-[48px]',
                            active
                                ? 'text-indigo-400 bg-indigo-500/10'
                                : 'text-zinc-500 hover:text-zinc-300'
                        )}
                    >
                        <item.icon
                            className={cn(
                                'w-5 h-5 transition-all duration-300',
                                active ? 'text-indigo-400 drop-shadow-[0_0_6px_rgba(99,102,241,0.7)]' : 'text-zinc-500'
                            )}
                        />
                        <span className={cn(
                            'text-[10px] font-semibold tracking-wide leading-none transition-all duration-300',
                            active ? 'text-indigo-400' : 'text-zinc-500'
                        )}>
                            {item.label}
                        </span>
                        {active && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-indigo-400 rounded-full" />
                        )}
                    </Link>
                )
            })}
        </div>
    )
}
