'use client'

import {
    CircleDashed, Loader, Eye, RotateCcw, Check, CheckCircle2, Clock, AlertCircle, Ban,
    Mic, Film, Smartphone,
} from 'lucide-react'
import { brandTint, initials, PIPELINE, deliverableIcon } from './format'

type Cfg = { color: string; soft: string; line: string; Icon: any; label: string }

/* Merged config — task clientStatus + invoice ledger status (keys are disjoint). */
export const STATUS_CFG: Record<string, Cfg> = {
    'Pending': { color: 'var(--neutral)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: CircleDashed, label: 'Pending' },
    'In Progress': { color: 'var(--accent-fg)', soft: 'var(--accent-soft)', line: 'var(--accent-line)', Icon: Loader, label: 'In Progress' },
    'Action Required': { color: 'var(--attn)', soft: 'var(--attn-soft)', line: 'var(--attn-line)', Icon: Eye, label: 'In Review' },
    'Revising': { color: 'var(--revise)', soft: 'var(--revise-soft)', line: 'var(--revise-line)', Icon: RotateCcw, label: 'Revising' },
    'Completed': { color: 'var(--ok)', soft: 'var(--ok-soft)', line: 'var(--ok-line)', Icon: Check, label: 'Completed' },
    'Paid': { color: 'var(--ok)', soft: 'var(--ok-soft)', line: 'var(--ok-line)', Icon: CheckCircle2, label: 'Paid' },
    'Due': { color: 'var(--neutral)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: Clock, label: 'Due' },
    'Overdue': { color: 'var(--danger)', soft: 'var(--danger-soft)', line: 'var(--danger-line)', Icon: AlertCircle, label: 'Overdue' },
    'Void': { color: 'var(--fg-4)', soft: 'var(--neutral-soft)', line: 'var(--neutral-line)', Icon: Ban, label: 'Void' },
}

export function StatusBadge({ status, compact = false, labelOverride }: { status: string; compact?: boolean; labelOverride?: string }) {
    const cfg = STATUS_CFG[status] || STATUS_CFG['Pending']
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

/* Read-only 5-step pipeline tracker (Pending → In Progress → In Review → Revising → Completed). */
export function PipelineTracker({ status }: { status: string }) {
    const curr = PIPELINE.indexOf(status as any)
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {PIPELINE.map((step, i) => {
                const done = curr >= 0 && i < curr
                const active = i === curr
                const cfg = STATUS_CFG[step]
                const color = active ? cfg.color : done ? 'var(--ok)' : 'var(--fg-4)'
                return (
                    <div key={step} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                            <span style={{ flex: 1, height: 2, background: i === 0 ? 'transparent' : (i <= curr ? 'var(--ok)' : 'var(--line-2)') }} />
                            <span style={{
                                width: 24, height: 24, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: active ? cfg.soft : done ? 'var(--ok-soft)' : 'var(--surface-2)',
                                border: '1px solid ' + (active ? cfg.line : done ? 'var(--ok-line)' : 'var(--line-2)'), color,
                            }}>
                                {done ? <Check size={12} /> : active ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color }} /> : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--fg-4)' }} />}
                            </span>
                            <span style={{ flex: 1, height: 2, background: i === PIPELINE.length - 1 ? 'transparent' : (i < curr ? 'var(--ok)' : 'var(--line-2)') }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: active ? 700 : 600, color: active ? cfg.color : done ? 'var(--fg-2)' : 'var(--fg-4)', marginTop: 7, textAlign: 'center', lineHeight: 1.2 }}>{cfg.label}</span>
                    </div>
                )
            })}
        </div>
    )
}
