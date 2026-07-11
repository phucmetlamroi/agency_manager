'use client'

// [Mobile P2 §Pattern 9 / FR-H4] EmptyState dùng chung: icon + copy + CTA tùy chọn.
// Thay cho "màn đen trống" (f_0053) và "dãy card 0 trơ" (f_0116). Dark "Liquid Glass",
// canh giữa, chữ mờ nhất là text-muted-foreground (không xuống zinc-600). Dùng trong
// list rỗng (MobileTaskView), widget rỗng, và error.tsx (variant="error", FR-H6).
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { Inbox, PartyPopper, SearchX, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type EmptyStateVariant = 'first-use' | 'cleared' | 'no-results' | 'error'

export type EmptyStateProps = {
    /** Ngữ cảnh rỗng — quyết định icon mặc định + ý nghĩa. Mặc định 'no-results'. */
    variant?: EmptyStateVariant
    /** Tiêu đề ngắn 1 dòng (15px). */
    title: string
    /** Mô tả phụ (13px, text-muted-foreground). */
    description?: string
    /** Ghi đè icon mặc định của variant (lucide icon component). */
    icon?: LucideIcon
    /** CTA tùy chọn — nút link (href) hoặc nút hành động (onClick). Tap target ≥44px. */
    cta?: { label: string; onClick?: () => void; href?: string }
    /** Class bổ sung cho container (canh khoảng cách theo ngữ cảnh). */
    className?: string
}

// Icon mặc định theo variant (Pattern 9.3).
const DEFAULT_ICON: Record<EmptyStateVariant, LucideIcon> = {
    'first-use': Inbox,
    cleared: PartyPopper,
    'no-results': SearchX,
    error: RefreshCcw,
}

export function EmptyState({
    variant = 'no-results',
    title,
    description,
    icon,
    cta,
    className,
}: EmptyStateProps) {
    const Icon = icon ?? DEFAULT_ICON[variant]
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] bg-surface-1/60 px-6 py-12 text-center backdrop-blur-sm',
                className,
            )}
        >
            {/* icon trang trí — zinc-500 hợp lệ vì không phải text nội dung */}
            <Icon aria-hidden className="mb-3 h-10 w-10 text-zinc-500" />
            <p className="text-[15px] font-semibold text-foreground">{title}</p>
            {description && (
                <p className="mt-1 max-w-[28ch] text-body-sm text-muted-foreground">{description}</p>
            )}
            {cta && (
                <div className="mt-4">
                    {cta.href ? (
                        <Button variant="secondary" size="sm" className="min-h-[44px] px-4" asChild>
                            <Link href={cta.href}>{cta.label}</Link>
                        </Button>
                    ) : (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="min-h-[44px] px-4"
                            onClick={cta.onClick}
                        >
                            {cta.label}
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

export default EmptyState
