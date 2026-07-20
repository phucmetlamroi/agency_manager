'use client'

/* THE DESK — Productions index. A studio ledger of every deliverable, grouped by
   channel, filtered by stage. The editor is never shown (assignee is null on the
   token portal) — the client sees the work, its deadline, its price, its stage. */

import { useMemo, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { Empty, avatarTint } from './ui'
import { fmtMoney, fmtDate, relDeadline, initials } from '../calm/format'
import { toneColor, deskStatus } from './status'
import type { Deliverable, Brand } from '../calm/types'

type ChipId = 'all' | 'awaiting' | 'progress' | 'revision' | 'delivered'
const CHIPS: { id: ChipId; label: string; test: (d: Deliverable) => boolean }[] = [
    { id: 'all', label: 'All', test: () => true },
    { id: 'awaiting', label: 'Awaiting you', test: d => d.needsYou },
    { id: 'progress', label: 'In progress', test: d => !d.needsYou && ['In progress', 'In production', 'Received', 'In review'].includes(d.clientStatus) },
    { id: 'revision', label: 'In revision', test: d => ['In revision', 'Revising', 'Revisions delivered'].includes(d.clientStatus) },
    { id: 'delivered', label: 'Delivered', test: d => d.clientStatus === 'Completed' },
]

const COLS = '54px minmax(0,1.7fr) 130px 120px 130px'

export default function Productions({
    deliverables, brands, scope, setScope, showPeriod, periodLabel, openDeliverable,
}: {
    deliverables: Deliverable[]
    brands: Brand[]
    scope: number | 'all'
    setScope: (s: number | 'all') => void
    showPeriod: boolean
    periodLabel: string
    openDeliverable: (id: string) => void
}) {
    const [chip, setChip] = useState<ChipId>('all')

    const chipCounts = useMemo(() => {
        const m = {} as Record<ChipId, number>
        for (const c of CHIPS) m[c.id] = deliverables.filter(c.test).length
        return m
    }, [deliverables])

    const filtered = useMemo(() => deliverables.filter(CHIPS.find(c => c.id === chip)!.test), [deliverables, chip])

    // Group by channel, ordered by the brand list (freshest first).
    const groups = useMemo(() => {
        const order = brands.map(b => b.id)
        const byBrand = new Map<number | 'none', Deliverable[]>()
        for (const d of filtered) {
            const k = d.client?.id ?? 'none'
            const arr = byBrand.get(k) || []
            arr.push(d)
            byBrand.set(k, arr)
        }
        const out: { id: number | 'none'; name: string; rows: Deliverable[] }[] = []
        for (const id of order) {
            const rows = byBrand.get(id)
            if (rows && rows.length) out.push({ id, name: brands.find(b => b.id === id)?.name || 'Channel', rows })
        }
        const none = byBrand.get('none')
        if (none && none.length) out.push({ id: 'none', name: 'Unassigned', rows: none })
        return out
    }, [filtered, brands])

    const scopeName = scope === 'all' ? 'All videos' : (brands.find(b => b.id === scope)?.name || 'Channel')

    return (
        <main style={{ padding: '26px 30px', minHeight: 'calc(100vh - 58px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: 0 }}>{scopeName}</h1>
                <span className="desk-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>{deliverables.length} {deliverables.length === 1 ? 'VIDEO' : 'VIDEOS'} · {periodLabel.toUpperCase()}</span>
                {scope !== 'all' && (
                    <button onClick={() => setScope('all')} className="desk-btn desk-btn--ghost desk-btn--sm" style={{ marginLeft: 'auto' }}>All channels</button>
                )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
                {CHIPS.map(c => (
                    <button key={c.id} onClick={() => setChip(c.id)} style={{
                        border: '1px solid ' + (chip === c.id ? 'var(--ink)' : 'var(--hairline)'),
                        background: chip === c.id ? 'var(--ink)' : 'var(--paper-raised)',
                        color: chip === c.id ? 'var(--ink-invert)' : 'var(--ink-2)',
                        borderRadius: 999, padding: '4px 13px', fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', display: 'inline-flex', alignItems: 'center', gap: 7,
                    }}>
                        {c.label}
                        <span className="desk-mono" style={{ fontSize: '0.66rem', opacity: 0.7 }}>{chipCounts[c.id]}</span>
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <Empty icon={Clapperboard} title="Nothing in this stage" sub="Try another filter, or the whole index." />
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, padding: '0 14px 8px' }} className="desk-mono desk-prod-grid">
                        <span className="desk-col-opt" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ink-3)' }}>№</span>
                        <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ink-3)' }}>VIDEO</span>
                        <span className="desk-col-opt" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ink-3)' }}>DEADLINE</span>
                        <span className="desk-col-opt" style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ink-3)', textAlign: 'right' }}>PRICE</span>
                        <span style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--ink-3)', textAlign: 'right' }}>STATUS</span>
                    </div>
                    {groups.map(g => (
                        <div key={String(g.id)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', background: 'var(--paper-sunken)', borderTop: '1px solid var(--hairline-strong)' }}>
                                <span style={{ width: 18, height: 18, background: g.id === 'none' ? 'var(--stone)' : avatarTint(g.id), color: 'var(--ink-invert)', borderRadius: 2, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} className="desk-mono">
                                    <span style={{ fontSize: '0.52rem' }}>{initials(g.name)}</span>
                                </span>
                                <span style={{ fontWeight: 600, fontSize: '0.84rem' }}>{g.name}</span>
                                <span className="desk-mono" style={{ fontSize: '0.62rem', color: 'var(--ink-3)' }}>{g.rows.length}</span>
                            </div>
                            {g.rows.map((d, i) => {
                                const rel = d.clientStatus === 'Completed' ? null : relDeadline(d.deadline)
                                const s = deskStatus(d.clientStatus)
                                return (
                                    <div key={d.id} onClick={() => openDeliverable(d.id)} className="desk-prod-grid" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '11px 14px', borderTop: '1px solid var(--hairline-faint)', cursor: 'pointer', background: d.needsYou ? 'var(--accent-tint)' : 'transparent' }}
                                        onMouseEnter={e => { if (!d.needsYou) e.currentTarget.style.background = 'var(--paper-tint)' }}
                                        onMouseLeave={e => { if (!d.needsYou) e.currentTarget.style.background = 'transparent' }}>
                                        <span className="desk-mono desk-col-opt" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>{String(i + 1).padStart(2, '0')}</span>
                                        <span style={{ minWidth: 0 }}>
                                            <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{d.title}</p>
                                            <p className="desk-mono" style={{ fontSize: '0.6rem', color: 'var(--ink-3)', margin: '2px 0 0' }}>{[d.type, d.duration, showPeriod ? d.workspaceName : null].filter(Boolean).join(' · ')}</p>
                                        </span>
                                        <span className="desk-mono desk-col-opt" style={{ fontSize: '0.66rem', color: rel && rel.urgent ? 'var(--brick)' : 'var(--ink-2)' }}>{rel ? rel.text : (d.clientReviewedAt ? fmtDate(d.clientReviewedAt, false) : '—')}</span>
                                        <span className="desk-num desk-col-opt" style={{ fontSize: '0.72rem', color: 'var(--ink-2)', textAlign: 'right' }}>{d.jobPriceUSD != null && Number(d.jobPriceUSD) > 0 ? fmtMoney(d.jobPriceUSD) : '—'}</span>
                                        <span className="desk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', fontSize: '0.6rem', letterSpacing: '0.06em', color: toneColor(s.tone), textTransform: 'uppercase' }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{s.label}
                                        </span>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                    <div style={{ height: 60 }} />
                </>
            )}
        </main>
    )
}
