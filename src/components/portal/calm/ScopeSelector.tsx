'use client'

import { useEffect, useRef, useState } from 'react'
import { Layers, ChevronsUpDown, Search, Check } from 'lucide-react'
import { BrandAvatar } from './ui'
import type { Brand } from './types'

/* Searchable sub-brand (channel) scope switcher ("All channels" by default). */
export default function ScopeSelector({ scope, brands, onChange }: {
    scope: number | 'all'
    brands: Brand[]
    onChange: (s: number | 'all') => void
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

    const current = scope === 'all' ? null : brands.find(b => b.id === scope)
    const filtered = brands.filter(b => b.name.toLowerCase().includes(q.toLowerCase()))
    const total = brands.reduce((a, b) => a + (b.count || 0), 0)

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button className="pc-select-trigger" data-open={open} onClick={() => setOpen(o => !o)} style={{ minWidth: 188 }}>
                {current
                    ? <BrandAvatar name={current.name} id={current.id} size={26} radius={8} />
                    : <span style={{ width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-fg)', border: '1px solid var(--accent-line)' }}><Layers size={14} /></span>}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.25, flex: 1, minWidth: 0 }}>
                    <span className="eyebrow" style={{ fontSize: 9 }}>Channel</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 126 }}>{current ? current.name : 'All channels'}</span>
                </span>
                <ChevronsUpDown size={15} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
            </button>

            {open && (
                <div className="pc-menu">
                    <div style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ color: 'var(--fg-3)', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Find a channel" className="pc-input" style={{ height: 36, paddingLeft: 32, fontSize: 13 }} />
                        </div>
                    </div>
                    <div style={{ padding: 6, maxHeight: 300, overflowY: 'auto' }}>
                        <ScopeRow active={scope === 'all'} onClick={() => { onChange('all'); setOpen(false) }}
                            icon={<span style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--accent-fg)', border: '1px solid var(--accent-line)' }}><Layers size={15} /></span>}
                            title="All channels" sub={`${brands.length} ${brands.length === 1 ? 'channel' : 'channels'} · ${total} ${total === 1 ? 'video' : 'videos'}`} />
                        {filtered.map(b => (
                            <ScopeRow key={b.id} active={scope === b.id} onClick={() => { onChange(b.id); setOpen(false) }}
                                icon={<BrandAvatar name={b.name} id={b.id} size={28} radius={8} />} title={b.name}
                                sub={b.count != null ? `${b.count} ${b.count === 1 ? 'video' : 'videos'}` : 'Channel'} />
                        ))}
                        {filtered.length === 0 && <div style={{ padding: '14px 10px', fontSize: 13, color: 'var(--fg-3)' }}>No channels match.</div>}
                    </div>
                </div>
            )}
        </div>
    )
}

function ScopeRow({ active, onClick, icon, title, sub }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; sub: string }) {
    return (
        <button onClick={onClick}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '8px 10px', borderRadius: 10, border: '1px solid ' + (active ? 'var(--accent-line)' : 'transparent'), background: active ? 'var(--accent-soft)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}>
            {icon}
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</span>
            </span>
            {active && <Check size={15} style={{ color: 'var(--accent-fg)', flexShrink: 0 }} />}
        </button>
    )
}
