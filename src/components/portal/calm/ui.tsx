'use client'

import {
    CircleDashed, Loader, Eye, RotateCcw, Check, CheckCircle2, Clock, AlertCircle, Ban,
    Mic, Film, Smartphone,
} from 'lucide-react'
import { brandTint, initials, deliverableIcon } from './format'

type Cfg = { color: string; soft: string; line: string; Icon: any; label: string }

/* Merged config — deliverable clientStatus (admin-mirrored, from portal-derive.ts)
   + invoice ledger status. Keys are disjoint. Status hues mirror the admin board
   (StatusCell.tsx), light-tuned via --st-* tokens. */
export const STATUS_CFG: Record<string, Cfg> = {
    // Deliverable statuses (faithful to admin)
    'Awaiting your review': { color: 'var(--accent-fg)', soft: 'var(--accent-soft)', line: 'var(--accent-line)', Icon: Eye, label: 'Awaiting your review' },
    'Received': { color: 'var(--st-received)', soft: 'var(--st-received-soft)', line: 'var(--st-received-line)', Icon: CircleDashed, label: 'Received' },
    'In production': { color: 'var(--st-received)', soft: 'var(--st-received-soft)', line: 'var(--st-received-line)', Icon: Loader, label: 'In production' },
    'In progress': { color: 'var(--st-progress)', soft: 'var(--st-progress-soft)', line: 'var(--st-progress-line)', Icon: Loader, label: 'In progress' },
    'In revision': { color: 'var(--st-revision)', soft: 'var(--st-revision-soft)', line: 'var(--st-revision-line)', Icon: RotateCcw, label: 'In revision' },
    'Revisions delivered': { color: 'var(--st-resent)', soft: 'var(--st-resent-soft)', line: 'var(--st-resent-line)', Icon: Check, label: 'Revisions delivered' },
    'On hold': { color: 'var(--st-hold)', soft: 'var(--st-hold-soft)', line: 'var(--st-hold-line)', Icon: Clock, label: 'On hold' },
    'Completed': { color: 'var(--st-done)', soft: 'var(--st-done-soft)', line: 'var(--st-done-line)', Icon: Check, label: 'Completed' },
    'Closed': { color: 'var(--fg-4)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: Ban, label: 'Closed' },
    // Invoice ledger statuses
    'Paid': { color: 'var(--ok)', soft: 'var(--ok-soft)', line: 'var(--ok-line)', Icon: CheckCircle2, label: 'Paid' },
    'Due': { color: 'var(--neutral)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: Clock, label: 'Due' },
    'Overdue': { color: 'var(--danger)', soft: 'var(--danger-soft)', line: 'var(--danger-line)', Icon: AlertCircle, label: 'Overdue' },
    'Void': { color: 'var(--fg-4)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: Ban, label: 'Void' },
}

export function StatusBadge({ status, compact = false, labelOverride }: { status: string; compact?: boolean; labelOverride?: string }) {
    const cfg = STATUS_CFG[status] || STATUS_CFG['Received']
    const Icon = cfg.Icon
    return (
        <span className="pc-pill" style={{ background: cfg.soft, borderColor: cfg.line, color: cfg.color, fontSize: compact ? 11 : 11.5, padding: compact ? '4px 9px 4px 7px' : undefined }}>
            <Icon size={12} strokeWidth={2.2} />
            {labelOverride || cfg.label}
        </span>
    )
}

export function BrandAvatar({ name, id, size = 34, radius = 10 }: { name: string; id?: string | number; size?: number; radius?: number }) {
    const tint = brandTint(id ?? name)
    return (
        <span style={{
            width: size, height: size, borderRadius: radius, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            background: tint + '1f', color: tint, border: '1px solid ' + tint + '33',
            fontSize: size * 0.34, fontWeight: 700, letterSpacing: '0.02em',
        }}>
            {initials(name)}
        </span>
    )
}

export function FilterChip({ label, count, active, onClick, dotColor }: {
    label: string; count?: number; active: boolean; onClick: () => void; dotColor?: string | null
}) {
    return (
        <button onClick={onClick} style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 12px',
            borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
            background: active ? 'var(--accent-soft)' : 'var(--surface-2)',
            border: '1px solid ' + (active ? 'var(--accent-line)' : 'var(--line-2)'),
            color: active ? 'var(--accent-fg)' : 'var(--fg-2)', transition: 'all .15s',
        }}>
            {dotColor && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />}
            {label}
            {count != null && <span className="num" style={{ fontSize: 12, opacity: 0.8 }}>{count}</span>}
        </button>
    )
}

export function DeliverableTypeIcon({ type, size = 18 }: { type?: string | null; size?: number }) {
    const name = deliverableIcon(type)
    const Icon = name === 'mic' ? Mic : name === 'film' ? Film : Smartphone
    return <Icon size={size} />
}

/* A plain-English one-liner that explains the current status to a client,
   shown next to the StatusBadge in the detail panel (replaces the old 5-step
   PipelineTracker — see redesign plan P5). */
export function statusSentence(clientStatus: string): string {
    switch (clientStatus) {
        case 'Awaiting your review': return 'A cut is ready — please review it below.'
        case 'Received': return 'We’ve received this and it’s queued to start.'
        case 'In production': return 'We’re lining this up to start editing.'
        case 'In progress': return 'Our team is editing this right now.'
        case 'In revision': return 'We’re working through your requested changes.'
        case 'Revisions delivered': return 'Your changes are in — a fresh cut is on the way.'
        case 'On hold': return 'This is paused for now.'
        case 'Completed': return 'Approved and delivered.'
        case 'Closed': return 'This project was closed.'
        default: return ''
    }
}

export function Empty({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '56px 24px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--line-2)', marginBottom: 14 }}>
                <Icon size={22} style={{ color: 'var(--fg-3)' }} />
            </div>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>{title}</p>
            {sub && <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--fg-3)', maxWidth: 320 }}>{sub}</p>}
        </div>
    )
}

