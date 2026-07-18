'use client'

/* THE DESK — screening room. A full-screen dark overlay that embeds the real
   guest review player (/r/[slug]) in a same-origin iframe, so the client watches,
   comments, annotates and approves WITHOUT leaving the portal. The player, its
   Mux playback, guest identity and decision flow are the battle-tested review
   module — we only frame it. Same-origin (frame-ancestors 'self' in next.config)
   keeps the rv_guest_/rv_unlock_ cookies flowing. */

import { useEffect } from 'react'
import { X, ExternalLink, Clapperboard } from 'lucide-react'
import { Kicker } from './ui'

export default function ScreeningRoom({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        // lock body scroll while the room is open
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
    }, [onClose])

    return (
        <div
            data-theme="dark"
            role="dialog"
            aria-modal="true"
            aria-label={`Screening room — ${title}`}
            style={{
                position: 'fixed', inset: 0, zIndex: 100, background: 'var(--paper)', color: 'var(--ink)',
                display: 'flex', flexDirection: 'column', animation: 'desk-fade var(--t-med) var(--ease)',
            }}
        >
            <header style={{ display: 'flex', alignItems: 'center', gap: 14, height: 56, padding: '0 20px', flexShrink: 0, borderBottom: '1px solid var(--hairline)', background: 'var(--paper-raised)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 6, background: 'var(--accent-tint)', border: '1px solid var(--accent-line)', color: 'var(--accent)', flexShrink: 0 }}>
                    <Clapperboard size={15} />
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                    <Kicker accent style={{ fontSize: '0.56rem' }}>Screening room</Kicker>
                    <p className="desk-serif desk-truncate" style={{ margin: 0, fontSize: '0.98rem', color: 'var(--ink)', lineHeight: 1.1 }}>{title}</p>
                </span>
                <a href={url} target="_blank" rel="noopener noreferrer" className="desk-btn desk-btn--quiet desk-btn--sm" style={{ textDecoration: 'none' }} title="Open in a new tab">
                    <ExternalLink size={13} /> New tab
                </a>
                <button onClick={onClose} className="desk-iconbtn" aria-label="Close screening room" title="Close (Esc)"><X size={19} /></button>
            </header>
            <div style={{ flex: 1, minHeight: 0, background: '#000' }}>
                <iframe
                    src={url}
                    title={`Review — ${title}`}
                    allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                    style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
                />
            </div>
        </div>
    )
}
