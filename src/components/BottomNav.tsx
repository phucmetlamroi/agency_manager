'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, ClipboardList, CalendarDays, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function BottomNav({ role, workspaceId }: { role: string, workspaceId: string }) {
    const pathname = usePathname()
    const isActive = (path: string) => pathname === path

    const navItems = [
        {
            href: `/${workspaceId}/dashboard`,
            label: 'Trang chủ',
            icon: Home,
            show: true,
        },
        {
            href: role === 'ADMIN' ? `/${workspaceId}/admin` : `/${workspaceId}/dashboard`,
            label: 'Task',
            icon: ClipboardList,
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
            label: role === 'ADMIN' ? 'Lương' : 'Thu nhập',
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
                                ? 'text-primary-accent bg-primary/10'
                                : 'text-muted-foreground hover:text-zinc-300'
                        )}
                    >
                        <item.icon
                            className={cn(
                                'w-5 h-5 transition-all duration-300',
                                active ? 'text-primary-accent drop-shadow-[0_0_6px_rgba(99,102,241,0.7)]' : 'text-muted-foreground'
                            )}
                        />
                        <span className={cn(
                            'text-[10px] font-semibold tracking-wide leading-none transition-all duration-300',
                            active ? 'text-primary-accent' : 'text-muted-foreground'
                        )}>
                            {item.label}
                        </span>
                        {active && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                        )}
                    </Link>
                )
            })}
        </div>
    )
}
