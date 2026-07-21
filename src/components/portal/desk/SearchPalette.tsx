'use client'

/* THE DESK — ⌘K search palette. Jumps to a production or a statement by name. */

import { useMemo, useRef, useState, useEffect } from 'react'
import { Search, Clapperboard, FileText, CornerDownLeft } from 'lucide-react'
import { StatusPill } from './ui'
import { fmtMoney, mapInvoiceStatus } from '../calm/format'
import type { Deliverable, Invoice } from '../calm/types'

type Hit =
    | { kind: 'del'; id: string; title: string; sub: string; status: string }
    | { kind: 'inv'; id: string; title: string; sub: string; status: string }

export default function SearchPalette({ deliverables, invoices, onClose, openDeliverable, openInvoice }: {
    deliverables: Deliverable[]
    invoices: Invoice[]
    onClose: () => void
    openDeliverable: (id: string) => void
    openInvoice: (id: string) => void
}) {
    const [q, setQ] = useState('')
    const [active, setActive] = useState(0)
    const inputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => { inputRef.current?.focus() }, [])

    /* [Parity review 2026-07] The caps used to be 8 deliverables and 5 statements, with no
       "showing X of Y" anywhere. A client with 40 videos searching a common word saw 8 and
       reasonably concluded the 9th did not exist — a silent truncation feeding the very
       complaint that work was "going missing". The list scrolls; there is no reason to
       hide matches. A high ceiling stays only to keep the DOM sane. */
    const CAP = 40

    const { hits, total } = useMemo(() => {
        const term = q.trim().toLowerCase()
        const delMatches = deliverables.filter(d =>
            !term ||
            d.title.toLowerCase().includes(term) ||
            (d.client?.name || '').toLowerCase().includes(term) ||
            (d.type || '').toLowerCase().includes(term))
        const invMatches = invoices.filter(i =>
            !term ||
            i.invoiceNumber.toLowerCase().includes(term) ||
            // Statements used to match only on the number, so searching a video's name never
            // found the statement that billed it — even though the line items carry it.
            (i.items || []).some(it => (it.description || '').toLowerCase().includes(term)))

        const dels: Hit[] = delMatches.slice(0, CAP).map(d => ({
            kind: 'del', id: d.id, title: d.title,
            sub: [d.client?.name, d.type].filter(Boolean).join(' · '), status: d.clientStatus,
        }))
        const invs: Hit[] = invMatches.slice(0, CAP).map(i => ({
            kind: 'inv', id: i.id, title: i.invoiceNumber,
            sub: fmtMoney(i.totalDue), status: mapInvoiceStatus(i.status),
        }))
        return { hits: [...dels, ...invs], total: delMatches.length + invMatches.length }
    }, [q, deliverables, invoices])

    useEffect(() => { setActive(0) }, [q])

    const choose = (h: Hit) => { h.kind === 'del' ? openDeliverable(h.id) : openInvoice(h.id) }

    const onKey = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, hits.length - 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
        else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) choose(hits[active]) }
    }

    return (
        <>
            <div className="desk-scrim" onClick={onClose} style={{ zIndex: 70, alignItems: 'flex-start' }} />
            <div role="dialog" aria-modal="true" aria-label="Search" style={{ position: 'fixed', top: '12vh', left: '50%', transform: 'translateX(-50%)', width: 'min(600px, 94vw)', zIndex: 71, background: 'var(--paper-raised)', border: '1px solid var(--hairline-strong)', borderRadius: 10, boxShadow: 'var(--shadow-modal)', overflow: 'hidden' }} className="desk-rise">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--hairline)' }}>
                    <Search size={17} style={{ color: 'var(--ink-3)' }} />
                    <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search videos and statements…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: '1rem', color: 'var(--ink)' }} />
                    <span className="desk-mono" style={{ fontSize: '0.6rem', color: 'var(--ink-3)', border: '1px solid var(--hairline)', borderRadius: 2, padding: '2px 6px' }}>ESC</span>
                </div>
                <div style={{ maxHeight: '52vh', overflowY: 'auto', padding: 6 }}>
                    {hits.length === 0 ? (
                        <p style={{ padding: '24px 16px', textAlign: 'center', fontSize: '0.86rem', color: 'var(--ink-3)', margin: 0 }}>No matches.</p>
                    ) : hits.map((h, i) => (
                        <button key={h.kind + h.id} onMouseEnter={() => setActive(i)} onClick={() => choose(h)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', background: i === active ? 'var(--paper-tint)' : 'transparent' }}>
                            <span style={{ width: 30, height: 30, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-sunken)', border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}>
                                {h.kind === 'del' ? <Clapperboard size={15} /> : <FileText size={15} />}
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                                <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{h.title}</p>
                                {h.sub && <p className="desk-mono desk-truncate" style={{ margin: '2px 0 0', fontSize: '0.62rem', color: 'var(--ink-3)' }}>{h.sub}</p>}
                            </span>
                            <StatusPill status={h.status} />
                            {i === active && <CornerDownLeft size={14} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />}
                        </button>
                    ))}
                    {/* If anything IS held back, say so rather than letting the client assume
                        the list is complete. */}
                    {total > hits.length && (
                        <p className="desk-mono" style={{ padding: '10px 12px 4px', textAlign: 'center', fontSize: '0.6rem', letterSpacing: '0.06em', color: 'var(--ink-3)', margin: 0 }}>
                            SHOWING {hits.length} OF {total} — TYPE MORE TO NARROW
                        </p>
                    )}
                </div>
            </div>
        </>
    )
}
