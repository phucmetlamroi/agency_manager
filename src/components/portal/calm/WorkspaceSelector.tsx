'use client'

import { useEffect, useRef, useState } from 'react'
import { CalendarRange, ChevronsUpDown, Search, Check, Library } from 'lucide-react'
import type { Workspace } from './types'

/**
 * [Atelier] Period switcher — the client-facing twin of the admin's
 * "Tháng X/2026" workspace dropdown. Lists only the periods that actually hold
 * this client's work (newest first, resolved server-side) so a client browses
 * their history one book at a time, exactly like staff do.
 */
export default function WorkspaceSelector({ workspaces, value, counts, onChange }: {
    workspaces: Workspace[]
    value: string | 'all'
    /** deliverable count per workspace id, for the menu subtitle */
    counts: Record<string, number>
    onChange: (v: string | 'all') => void
}) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!open) return
        const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', h)
        return () => document.removeEventListener('mousedown', h)
    }, [open])

    const current = value === 'all' ? null : workspaces.find(w => w.id === value)
    const filtered = workspaces.filter(w => w.name.toLowerCase().includes(q.toLowerCase()))

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button className="pc-select-trigger" data-open={open} onClick={() => setOpen(o => !o)} style={{ minWidth: 196 }}>
                <span style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: current ? 'var(--accent-soft)' : 'var(--surface-3)', color: current ? 'var(--accent-fg)' : 'var(--fg-2)',
                    border: '1px solid ' + (current ? 'var(--accent-line)' : 'var(--line-2)'),
                }}>
                    {current ? <CalendarRange size={14} /> : <Library size={14} />}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                    <span className="eyebrow" style={{ fontSize: 9 }}>Period</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 134 }}>
                        {current ? current.name : 'All periods'}
                    </span>
                </span>
                <ChevronsUpDown size={15} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
            </button>

            {open && (
                <div className="pc-menu">
                    <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ color: 'var(--fg-3)', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a period" className="pc-input" style={{ height: 36, paddingLeft: 32, fontSize: 13 }} />
                        </div>
                    </div>
                    <div style={{ padding: 6, maxHeight: 300, overflowY: 'auto' }}>
                        <Row active={value === 'all'} onClick={() => { onChange('all'); setOpen(false) }}
                            icon={<Library size={15} />} accentIcon
                            title="All periods" sub={`${workspaces.length} ${workspaces.length === 1 ? 'book' : 'books'} of work`} />
                        {filtered.map(w => {
                            const n = counts[w.id] || 0
                            return (
                                <Row key={w.id} active={value === w.id} onClick={() => { onChange(w.id); setOpen(false) }}
                                    icon={<CalendarRange size={15} />}
                                    title={w.name} sub={`${n} ${n === 1 ? 'deliverable' : 'deliverables'}`} />
                            )
                        })}
                        {filtered.length === 0 && <div style={{ padding: '14px 10px', fontSize: 13, color: 'var(--fg-3)' }}>No periods match.</div>}
                    </div>
                </div>
            )}
        </div>
    )
}

function Row({ active, onClick, icon, accentIcon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; accentIcon?: boolean; title: string; sub: string }) {
    return (
        <button onClick={onClick}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 10, border: '1px solid ' + (active ? 'var(--accent-line)' : 'transparent'), background: active ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}>
            <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: accentIcon || active ? 'var(--accent-soft)' : 'var(--surface-3)', color: accentIcon || active ? 'var(--accent-fg)' : 'var(--fg-2)',
                border: '1px solid ' + (accentIcon || active ? 'var(--accent-line)' : 'var(--line-2)'),
            }}>{icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
            </span>
            {active && <Check size={15} style={{ color: 'var(--accent-fg)', flexShrink: 0 }} />}
        </button>
    )
}
