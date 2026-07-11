// src/components/admin/AttentionSection.tsx
// [P3 / M3.2 · FR-C2] Admin "Cần chú ý" block — the Today-first triage list that
// replaces the hero/board clutter on mobile. Only rows with count > 0 render; each
// row deep-links to the pre-filtered spoke (M3.5). Server-renderable.

import Link from 'next/link'
import { AlertTriangle, RefreshCw, Inbox, MessageSquareWarning, ChevronRight, type LucideIcon } from 'lucide-react'

export type AttentionKind = 'overdue' | 'revision' | 'waiting' | 'client'

export type AttentionRow = {
    kind: AttentionKind
    count: number
    href: string
}

const META: Record<AttentionKind, { icon: LucideIcon; tone: string; label: (n: number) => string }> = {
    overdue: { icon: AlertTriangle, tone: 'text-destructive', label: (n) => `${n} task quá hạn` },
    revision: { icon: RefreshCw, tone: 'text-status-revision', label: (n) => `${n} task cần sửa` },
    waiting: { icon: Inbox, tone: 'text-status-waiting', label: (n) => `${n} task chờ giao` },
    client: { icon: MessageSquareWarning, tone: 'text-warning', label: (n) => `${n} khách đang vướng mắc` },
}

export default function AttentionSection({ rows }: { rows: AttentionRow[] }) {
    const visible = rows.filter((r) => r.count > 0)
    if (visible.length === 0) return null

    return (
        <div className="glass-1 rounded-xl divide-y divide-white/[0.06]">
            {visible.map((r) => {
                const m = META[r.kind]
                const Icon = m.icon
                return (
                    <Link
                        key={r.kind}
                        href={r.href}
                        className="flex min-h-14 items-center gap-3 px-4 active:scale-[0.97] transition-transform"
                    >
                        <Icon size={20} className={`shrink-0 ${m.tone}`} />
                        <span className="min-w-0 flex-1 text-body-sm text-foreground">{m.label(r.count)}</span>
                        <ChevronRight size={16} className="shrink-0 text-zinc-500" />
                    </Link>
                )
            })}
        </div>
    )
}
