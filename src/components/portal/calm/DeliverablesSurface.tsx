'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Clapperboard } from 'lucide-react'
import { StatusBadge, BrandAvatar, FilterChip, Empty, DeliverableTypeIcon } from './ui'
import { relDeadline } from './format'
import type { Deliverable, Brand } from './types'

const FILTERS = ['All', 'Needs you', 'In Progress', 'Revising', 'Completed'] as const
type Filter = typeof FILTERS[number]

function DeliverableRow({ d, onOpen }: { d: Deliverable; onOpen: (id: string) => void }) {
    const rel = d.clientStatus === 'Completed' ? null : relDeadline(d.deadline)
    return (
        <button onClick={() => onOpen(d.id)}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-hover)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line)'}
            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 15px', borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color .15s' }}>
            <span style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)', border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}>
                <DeliverableTypeIcon type={d.type} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 3, fontSize: 12, color: 'var(--fg-3)' }}>
                    <span>{d.type}</span>
                    {d.duration && <><span style={{ opacity: 0.4 }}>·</span><span className="num">{d.duration}</span></>}
                    {rel && rel.text && (<><span style={{ opacity: 0.4 }}>·</span><span style={{ color: rel.urgent ? 'var(--attn)' : 'var(--fg-3)', fontWeight: rel.urgent ? 600 : 400 }}>{rel.text}</span></>)}
                </div>
            </div>
            <StatusBadge status={d.clientStatus} />
            <ChevronRight size={17} style={{ color: 'var(--fg-4)', flexShrink: 0 }} />
        </button>
    )
}

export default function DeliverablesSurface({ deliverables, brands, openDeliverable }: {
    deliverables: Deliverable[]
    brands: Brand[]
    openDeliverable: (id: string) => void
}) {
    const [filter, setFilter] = useState<Filter>('All')
    const [openGroups, setOpenGroups] = useState<Set<number>>(new Set())
    const toggleGroup = (id: number) => setOpenGroups(prev => {
        const n = new Set(prev)
        if (n.has(id)) n.delete(id); else n.add(id)
        return n
    })
    // Collapsed by default; auto-expand when a specific status filter is active.
    const isGroupOpen = (id: number) => filter !== 'All' || openGroups.has(id)

    const match = (d: Deliverable) => {
        if (filter === 'All') return true
        if (filter === 'Needs you') return d.needsYou
        if (filter === 'In Progress') return ['In Progress', 'Pending'].includes(d.clientStatus)
        if (filter === 'Revising') return d.clientStatus === 'Revising'
        if (filter === 'Completed') return d.clientStatus === 'Completed'
        return true
    }
    const list = deliverables.filter(match)

    const counts: Record<Filter, number> = {
        'All': deliverables.length,
        'Needs you': deliverables.filter(d => d.needsYou).length,
        'In Progress': deliverables.filter(d => ['In Progress', 'Pending'].includes(d.clientStatus)).length,
        'Revising': deliverables.filter(d => d.clientStatus === 'Revising').length,
        'Completed': deliverables.filter(d => d.clientStatus === 'Completed').length,
    }

    const groups = brands
        .map(b => ({ brand: b, items: list.filter(d => d.client?.id === b.id) }))
        .filter(g => g.items.length > 0)
    const orphans = list.filter(d => d.client?.id == null)
    if (orphans.length) groups.push({ brand: { id: -1, name: 'Other' }, items: orphans })

    return (
        <div className="pc-view-in" style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg)' }}>Deliverables</h1>
                <p style={{ margin: '5px 0 0', fontSize: 14, color: 'var(--fg-2)' }}>Every video we&apos;re producing for you, by channel.</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <FilterChip key={f} label={f} count={counts[f]} active={filter === f} onClick={() => setFilter(f)}
                        dotColor={f === 'Needs you' ? '#FBBF24' : f === 'Revising' ? '#FB923C' : f === 'Completed' ? '#34D399' : null} />
                ))}
            </div>

            {groups.length === 0 ? (
                <div className="pc-card"><Empty icon={Clapperboard} title="Nothing here yet" sub="No deliverables match this filter for the selected channel." /></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {groups.map(g => {
                        const open = isGroupOpen(g.brand.id)
                        return (
                            <div key={g.brand.id} className="pc-card" style={{ padding: 6 }}>
                                <button onClick={() => toggleGroup(g.brand.id)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '8px 10px', borderRadius: 11, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}>
                                    <BrandAvatar name={g.brand.name} id={g.brand.id} size={30} radius={9} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.brand.name}</div>
                                    </div>
                                    <span className="num" style={{ fontSize: 12.5, color: 'var(--fg-3)', flexShrink: 0 }}>{g.items.length} {g.items.length === 1 ? 'video' : 'videos'}</span>
                                    <ChevronDown size={18} style={{ color: 'var(--fg-3)', flexShrink: 0, transition: 'transform .2s var(--ease)', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                                </button>
                                {open && (
                                    <div className="pc-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '6px 6px 8px' }}>
                                        {g.items.map(d => <DeliverableRow key={d.id} d={d} onOpen={openDeliverable} />)}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
