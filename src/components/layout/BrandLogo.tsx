import { cn } from '@/lib/utils'
import { BRAND } from '@/config/brand'

/**
 * [QĐ-6] Logo/wordmark DUY NHẤT của app — thay 3 logo tự chế (MobileLayoutShell,
 * UserTopNav, dashboard/layout). Gradient đọc từ token primary; tên từ BRAND.
 */
export function BrandLogo({ variant = 'full', className }: {
    variant?: 'full' | 'mark'
    className?: string
}) {
    return (
        <span className={cn('inline-flex items-center gap-2', className)}>
            <span
                className="grid h-8 w-8 place-items-center rounded-lg text-body-sm font-bold text-white shadow-md shadow-primary/30"
                style={{ background: BRAND.logo.gradient }}
            >
                {BRAND.logo.monogram}
            </span>
            {variant === 'full' && (
                <span className="text-title font-semibold tracking-tight text-foreground">{BRAND.name}</span>
            )}
        </span>
    )
}
