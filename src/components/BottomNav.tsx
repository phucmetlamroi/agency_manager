'use client'

// [Mobile P1 §3.5] BottomNav data-driven từ src/config/mobile-nav.ts.
// - active match DÀI-NHẤT-TRƯỚC → mỗi route sáng đúng 1 tab (Rủi ro #11).
// - ≥2 tín hiệu active (text-primary-accent + thanh indicator trên).
// - touch target ≥44×44 (flex-1 + h≥64). glass-2 + z-nav + safe-area (§3.4).
// - KHÔNG ẩn theo scroll (bài học ClickUp); CHỈ ẩn khi bàn phím mở (§6.4).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getTabsForRole } from '@/config/mobile-nav'
import { useKeyboardInset } from '@/hooks/useKeyboardInset'

export default function BottomNav({ role, workspaceId }: { role: string; workspaceId: string }) {
    const pathname = usePathname()
    const { open: keyboardOpen } = useKeyboardInset()
    const tabs = getTabsForRole(role, workspaceId)

    // Longest-match: tab có href khớp DÀI NHẤT là active (vd /admin/crm/123 → tab Khách,
    // không phải Trang chủ /admin).
    let activeKey: string | null = null
    let bestLen = -1
    for (const t of tabs) {
        const match = pathname === t.href || pathname.startsWith(t.href + '/')
        if (match && t.href.length > bestLen) {
            bestLen = t.href.length
            activeKey = t.key
        }
    }

    return (
        <nav
            className={cn(
                'fixed inset-x-0 bottom-0 z-nav md:hidden flex items-stretch h-[calc(64px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] glass-2 rounded-none border-x-0 border-b-0 transition-transform duration-300 will-change-transform',
                keyboardOpen ? 'translate-y-full' : 'translate-y-0'
            )}
        >
            {tabs.map((t) => {
                const active = t.key === activeKey
                const Icon = t.icon
                const badge = t.badge && t.badge > 0 ? (t.badge > 99 ? '99+' : String(t.badge)) : null
                return (
                    <Link
                        key={t.key}
                        href={t.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'relative flex flex-1 flex-col items-center justify-center gap-1 min-w-[44px] transition-colors duration-200',
                            active ? 'text-primary-accent' : 'text-muted-foreground hover:text-zinc-300'
                        )}
                    >
                        {active && (
                            <span className="absolute top-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-full bg-primary" />
                        )}
                        <span className="relative">
                            <Icon className={cn('h-5 w-5', active && 'drop-shadow-[0_0_6px_hsl(var(--primary))]')} />
                            {badge && (
                                <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-extrabold text-white">
                                    {badge}
                                </span>
                            )}
                        </span>
                        <span className="text-[11px] font-semibold leading-none">{t.label}</span>
                    </Link>
                )
            })}
        </nav>
    )
}
