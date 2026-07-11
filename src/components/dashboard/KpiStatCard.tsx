// src/components/dashboard/KpiStatCard.tsx
// [P3 / M2.2 · M3.2 · FR-C1 · Pattern 12] Mobile KPI card — reused by both the editor
// (M2) and admin (M3) Today-first homes. Server-renderable (no client state).
//
// Anatomy (top → bottom): Label (eyebrow) → Value (22px tabular) → Delta → Context.
// Full-width variant reserves an `h-10` sparkline slot (FR-H5.2 — no layout jump).

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

export type KpiStatCardProps = {
    /** Eyebrow label, e.g. "DOANH THU KỲ NÀY". Rendered uppercase. */
    label: string
    /** Pre-formatted, already-compacted value string, e.g. "9,5 Tr ₫" or "7". */
    value: string
    /** Optional delta chip, e.g. "+8%". Pair with `deltaTone`. */
    delta?: string
    deltaTone?: 'up' | 'down' | 'flat'
    /** Muted context line under the value, e.g. "so với kỳ trước". */
    context?: string
    /** Optional sparkline series → renders the reserved h-10 slot (full-width KPI). */
    sparkline?: number[]
    className?: string
}

/** Tiny dependency-free sparkline (SVG polyline). Decorative; no axis. */
function Sparkline({ data }: { data: number[] }) {
    const pts = data.filter((n) => typeof n === 'number' && isFinite(n))
    if (pts.length < 2) return <div className="h-10" aria-hidden />
    const max = Math.max(...pts)
    const min = Math.min(...pts)
    const range = max - min || 1
    const W = 100
    const H = 32
    const step = W / (pts.length - 1)
    const coords = pts.map((v, i) => {
        const x = i * step
        const y = H - ((v - min) / range) * H
        return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    return (
        <div className="h-10 flex items-end" aria-hidden>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-8 overflow-visible">
                <polyline
                    points={coords.join(' ')}
                    fill="none"
                    stroke="hsl(var(--primary-accent))"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    )
}

export default function KpiStatCard({
    label,
    value,
    delta,
    deltaTone = 'flat',
    context,
    sparkline,
    className = '',
}: KpiStatCardProps) {
    const deltaCls =
        deltaTone === 'up' ? 'text-success' : deltaTone === 'down' ? 'text-destructive' : 'text-muted-foreground'
    const DeltaIcon = deltaTone === 'up' ? ArrowUpRight : deltaTone === 'down' ? ArrowDownRight : null
    return (
        <div className={`glass-1 rounded-xl p-4 ${className}`}>
            <div className="flex items-start justify-between gap-2">
                <p className="text-label uppercase text-muted-foreground">{label}</p>
                {delta && (
                    <span className={`inline-flex items-center gap-0.5 text-body-sm font-medium ${deltaCls}`}>
                        {DeltaIcon && <DeltaIcon size={14} className="shrink-0" />}
                        {delta}
                    </span>
                )}
            </div>
            <p className="mt-1 text-page font-semibold tabular-nums text-foreground">{value}</p>
            {context && <p className="mt-0.5 text-caption text-muted-foreground">{context}</p>}
            {sparkline && <div className="mt-2"><Sparkline data={sparkline} /></div>}
        </div>
    )
}
