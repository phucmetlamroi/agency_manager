'use client'

/* The Desk — shared presentational primitives (Editorial Atelier).
   Structural styling lives in portal-desk.css; dynamic bits stay inline. */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties, type ButtonHTMLAttributes } from 'react'
import { Check, AlertCircle, Info, X } from 'lucide-react'
import { deskStatus, toneColor } from './status'
import { initials } from '../calm/format'

/* True when the viewport is a phone/narrow tablet (<900px). Drives the shell's
   drawer-nav swap. Returns false on the server + first paint so the ≥1024px
   desktop tree renders untouched, then corrects on mount. */
export function useIsNarrow(query = '(max-width: 899px)'): boolean {
    const [narrow, setNarrow] = useState(false)
    useEffect(() => {
        const mq = window.matchMedia(query)
        const on = () => setNarrow(mq.matches)
        on()
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [query])
    return narrow
}

/* ── Logo — the "through-line H" studio mark ─────────────────────────────── */
export function DeskMark({ size = 20, color = 'var(--ink)' }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden style={{ display: 'block', flexShrink: 0 }}>
            <rect x="20" y="14" width="12" height="12" fill={color} />
            <path d="M26 26 V82" stroke={color} strokeWidth="7" strokeLinecap="square" />
            <path d="M70 20 V70" stroke={color} strokeWidth="7" strokeLinecap="square" />
            <path d="M26 51 H70" stroke={color} strokeWidth="7" strokeLinecap="square" />
            <circle cx="70" cy="80" r="6.5" fill="var(--accent)" />
        </svg>
    )
}

/* ── Button ──────────────────────────────────────────────────────────────── */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'quiet'
export function Button({ variant = 'secondary', size = 'md', full = false, className = '', children, ...rest }: {
    variant?: BtnVariant
    size?: 'md' | 'sm'
    full?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    const v = variant === 'primary' ? 'desk-btn--primary'
        : variant === 'ghost' ? 'desk-btn--ghost'
        : variant === 'quiet' ? 'desk-btn--quiet' : ''
    return (
        <button
            className={`desk-btn ${v} ${size === 'sm' ? 'desk-btn--sm' : ''} ${className}`}
            style={full ? { width: '100%' } : undefined}
            {...rest}
        >
            {children}
        </button>
    )
}

export function IconButton({ label, badge = false, children, ...rest }: {
    label: string
    badge?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
    return (
        <button className="desk-iconbtn" aria-label={label} title={label} {...rest}>
            {children}
            {badge && <span style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)' }} />}
        </button>
    )
}

/* ── Kicker (mono, uppercase, tracked) ───────────────────────────────────── */
export function Kicker({ children, accent = false, index, style }: { children: ReactNode; accent?: boolean; index?: string; style?: CSSProperties }) {
    return (
        <p className={`kicker ${accent ? 'kicker--accent' : ''}`} style={style}>
            {index && <span className="kicker__index">{index}</span>}
            {children}
        </p>
    )
}

/* ── Status pill (typographic) ───────────────────────────────────────────── */
export function StatusPill({ status, labelOverride, style }: { status: string; labelOverride?: string; style?: CSSProperties }) {
    const s = deskStatus(status)
    const c = toneColor(s.tone)
    return (
        <span className="desk-pill" style={{ color: c, borderColor: 'color-mix(in srgb, ' + 'currentColor 34%, transparent)', ...style }}>
            <span className="desk-pill__dot" />
            {labelOverride || s.label}
        </span>
    )
}

/* ── Avatar (mono initials on a deterministic earth tint) ────────────────── */
const TINTS = ['#B5532C', '#A9761B', '#3E7D53', '#B0472E', '#8E7415', '#A85070', '#6E7A2E', '#A85C2E', '#2E7D74']
export function avatarTint(key: string | number): string {
    const s = String(key)
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return TINTS[h % TINTS.length]
}
export function Avatar({ name, id, size = 30 }: { name: string; id?: string | number; size?: number }) {
    const tint = avatarTint(id ?? name)
    return (
        <span className="desk-avatar" style={{
            width: size, height: size,
            background: tint + '22', color: tint, borderColor: tint + '3a',
            fontSize: Math.round(size * 0.36),
        }}>
            {initials(name)}
        </span>
    )
}

/* ── Empty state ─────────────────────────────────────────────────────────── */
export function Empty({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' }}>
            <div style={{ width: 46, height: 46, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-sunken)', border: '1px solid var(--hairline)', marginBottom: 14 }}>
                <Icon size={20} style={{ color: 'var(--ink-3)' }} />
            </div>
            <p className="desk-serif" style={{ margin: 0, fontSize: '1.05rem', color: 'var(--ink)' }}>{title}</p>
            {sub && <p style={{ margin: '6px 0 0', fontSize: '0.86rem', color: 'var(--ink-3)', maxWidth: 340 }}>{sub}</p>}
        </div>
    )
}

/* ── Toasts ──────────────────────────────────────────────────────────────── */
type Toast = { id: number; kind: 'ok' | 'err' | 'info'; text: string }
const ToastCtx = createContext<(kind: Toast['kind'], text: string) => void>(() => {})
export function useToast() { return useContext(ToastCtx) }

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const seq = useRef(0)
    const push = useCallback((kind: Toast['kind'], text: string) => {
        const id = ++seq.current
        setToasts(prev => [...prev, { id, kind, text }])
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4200)
    }, [])
    const value = useMemo(() => push, [push])
    return (
        <ToastCtx.Provider value={value}>
            {children}
            <div style={{ position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
                {toasts.map(t => {
                    const c = t.kind === 'ok' ? 'var(--sage)' : t.kind === 'err' ? 'var(--brick)' : 'var(--ink-2)'
                    const Icon = t.kind === 'ok' ? Check : t.kind === 'err' ? AlertCircle : Info
                    return (
                        <div key={t.id} className="desk-rise" style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                            background: 'var(--paper-raised)', border: '1px solid var(--hairline-strong)',
                            borderRadius: 6, boxShadow: 'var(--shadow-modal)', fontSize: '0.86rem', color: 'var(--ink)',
                            maxWidth: 440,
                        }}>
                            <Icon size={15} style={{ color: c, flexShrink: 0 }} />
                            {t.text}
                        </div>
                    )
                })}
            </div>
        </ToastCtx.Provider>
    )
}

/* ── Slide-over scaffold ─────────────────────────────────────────────────── */
export function Sheet({ onClose, width, children, label }: { onClose: () => void; width?: number; children: ReactNode; label?: string }) {
    return (
        <>
            <div className="desk-scrim" onClick={onClose} />
            <div className="desk-sheet" role="dialog" aria-modal="true" aria-label={label} style={width ? { width: `min(${width}px, 100vw)` } : undefined}>
                {children}
            </div>
        </>
    )
}

export function SheetHeader({ title, kicker, onClose, right }: { title: string; kicker?: string; onClose: () => void; right?: ReactNode }) {
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '20px 22px', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
                {kicker && <Kicker accent style={{ marginBottom: 5 }}>{kicker}</Kicker>}
                <h2 className="desk-serif" style={{ margin: 0, fontSize: '1.28rem', lineHeight: 1.15, color: 'var(--ink)' }}>{title}</h2>
            </div>
            {right}
            <IconButton label="Close" onClick={onClose} style={{ margin: '-6px -8px 0 0' }}><X size={18} /></IconButton>
        </div>
    )
}
