'use client'

// [Phase C] Client portal Settings — enter + verify (6-digit code) + persist a notification
// email, which receives review-status updates. Removable/changeable. English (client-facing).
import { useEffect, useState } from 'react'
import { X, Mail, Check, Loader2, Trash2, ShieldCheck } from 'lucide-react'
import type { DeliverableActions } from './types'

// Token-bound notify adapter (bound in SharePortalClient) — the raw token never reaches this
// component, mirroring how every other client action is injected.
export default function PortalSettings({ actions, onClose }: { actions: DeliverableActions; onClose: () => void }) {
    const [loading, setLoading] = useState(true)
    const [email, setEmail] = useState<string | null>(null) // the live, verified email
    const [pending, setPending] = useState<string | null>(null) // email awaiting a code
    const [emailInput, setEmailInput] = useState('')
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState<null | 'send' | 'verify' | 'remove'>(null)
    const [err, setErr] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)

    async function refresh() {
        const res = await actions.notifyGet?.()
        setEmail(res?.email ?? null)
        setPending(res?.pending ?? null)
        setLoading(false)
    }
    useEffect(() => { void refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

    async function sendCode() {
        if (busy || !actions.notifyRequest) return
        setErr(null); setNotice(null); setBusy('send')
        try {
            const res = await actions.notifyRequest(emailInput)
            if (res.success) { setNotice('We sent a 6-digit code to your email.'); await refresh() }
            else setErr(res.error || 'Something went wrong. Please try again.')
        } finally { setBusy(null) }
    }
    async function verify() {
        if (busy || !actions.notifyVerify) return
        setErr(null); setNotice(null); setBusy('verify')
        try {
            const res = await actions.notifyVerify(code)
            if (res.success) { setCode(''); setNotice('Email confirmed — you’ll receive review updates.'); await refresh() }
            else setErr(res.error || 'Something went wrong. Please try again.')
        } finally { setBusy(null) }
    }
    async function remove() {
        if (busy || !actions.notifyRemove) return
        setErr(null); setNotice(null); setBusy('remove')
        try {
            const res = await actions.notifyRemove()
            if (res.success) { setEmailInput(''); setCode(''); await refresh() }
            else setErr(res.error || 'Something went wrong. Please try again.')
        } finally { setBusy(null) }
    }

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.35)', zIndex: 90 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '94vw', zIndex: 91, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>Settings</div>
                        <h2 style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--fg)' }}>Email notifications</h2>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <p style={{ margin: 0, fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.55 }}>
                        Add an email to get notified when a new cut is ready to review, when we receive your
                        feedback, and when your project is approved. Your email is kept until you remove it.
                    </p>

                    {loading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--fg-3)', fontSize: 13 }}>
                            <Loader2 size={15} className="animate-spin" /> Loading…
                        </div>
                    ) : email ? (
                        // ── Verified ────────────────────────────────────────────────
                        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}><ShieldCheck size={20} /></span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
                                    <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 1 }}>Verified · receiving updates</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                <button className="pc-btn pc-btn-ghost" style={{ flex: 1, justifyContent: 'center' }} disabled={!!busy} onClick={() => { setEmailInput(''); setEmail(null); setPending(null); }}>
                                    Change
                                </button>
                                <button className="pc-btn pc-btn-quiet" style={{ justifyContent: 'center', color: 'var(--danger)' }} disabled={!!busy} onClick={remove}>
                                    {busy === 'remove' ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Remove
                                </button>
                            </div>
                        </div>
                    ) : pending ? (
                        // ── Awaiting code ───────────────────────────────────────────
                        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)' }}>
                            <p style={{ margin: '0 0 10px', fontSize: 13.5, color: 'var(--fg)' }}>
                                Enter the 6-digit code we sent to <strong>{pending}</strong>.
                            </p>
                            <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="123456" className="pc-input" style={{ letterSpacing: 6, textAlign: 'center', fontSize: 18, fontWeight: 700 }} />
                            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button className="pc-btn pc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!!busy || code.length !== 6} onClick={verify}>
                                    {busy === 'verify' ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} />} Verify
                                </button>
                                <button className="pc-btn pc-btn-quiet" disabled={!!busy} onClick={() => { setPending(null); setCode(''); }}>Use another email</button>
                            </div>
                        </div>
                    ) : (
                        // ── Enter email ─────────────────────────────────────────────
                        <div>
                            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-2)' }}>Email address</label>
                            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                                <input value={emailInput} onChange={e => setEmailInput(e.target.value)} type="email" placeholder="you@example.com" className="pc-input" style={{ flex: 1 }} />
                            </div>
                            <button className="pc-btn pc-btn-primary" style={{ marginTop: 12, justifyContent: 'center', width: '100%' }} disabled={!!busy || !emailInput.trim()} onClick={sendCode}>
                                {busy === 'send' ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Send verification code
                            </button>
                        </div>
                    )}

                    {notice && <p style={{ margin: 0, fontSize: 13, color: 'var(--ok)' }}>{notice}</p>}
                    {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{err}</p>}
                </div>
            </div>
        </>
    )
}
