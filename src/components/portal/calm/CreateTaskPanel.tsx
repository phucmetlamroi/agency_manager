'use client'

/**
 * [Client Task Submission] Slide-in form letting the client create a new task
 * straight from the share-link portal. Credential-agnostic: it only calls the
 * injected `actions.getSubmitOptions` / `actions.createTask` adapter (token is
 * closed over in SharePortalClient — never reaches this component).
 *
 * Close UX is deliberately the same as DeliverableDetailPanel (clickable scrim
 * + Escape) and the panel UNMOUNTS on close, so state resets synchronously —
 * avoiding the radial-menu "stuck open" class of bug (pointer-events:none scrim
 * + gesture-only close).
 */
import { useEffect, useState } from 'react'
import { X, Send, CheckCircle2, Loader2 } from 'lucide-react'
import type { DeliverableActions } from './types'

type Options = { workspaces: { id: string; label: string }[]; brands: { id: number; name: string }[] }

export default function CreateTaskPanel({ actions, onClose }: {
    actions: DeliverableActions
    onClose: () => void
}) {
    const [opts, setOpts] = useState<Options | null>(null)
    const [loading, setLoading] = useState(true)
    const [workspaceId, setWorkspaceId] = useState('')
    const [clientId, setClientId] = useState<number | ''>('')
    const [title, setTitle] = useState('')
    const [rawLink, setRawLink] = useState('')
    const [brollLink, setBrollLink] = useState('')
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    // Escape-to-close (standard modal pattern, not gesture detection).
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Load the scope-bound dropdown options on open; default to the newest
    // active month + the root brand.
    useEffect(() => {
        let alive = true
        if (!actions.getSubmitOptions) { setLoading(false); return }
        actions.getSubmitOptions()
            .then((res) => {
                if (!alive) return
                if (res) {
                    setOpts({ workspaces: res.workspaces, brands: res.brands })
                    setWorkspaceId(res.workspaces[0]?.id ?? '')
                    setClientId(res.brands[0]?.id ?? '')
                }
                setLoading(false)
            })
            .catch(() => { if (alive) { setErr('Could not load options. Please reload.'); setLoading(false) } })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const canSubmit = !busy && !!workspaceId && clientId !== '' && title.trim() && rawLink.trim()

    const submit = async () => {
        if (!canSubmit || !actions.createTask) return
        setBusy(true); setErr(null)
        const res = await actions.createTask({
            workspaceId,
            clientId: Number(clientId),
            title: title.trim(),
            rawLink: rawLink.trim(),
            brollLink: brollLink.trim() || undefined,
            notes: notes.trim() || undefined,
        })
        setBusy(false)
        if (res?.success) setDone(true)
        else setErr(res?.error || 'Could not send your request. Please try again.')
    }

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.35)', zIndex: 80 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '94vw', zIndex: 81, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>New request</div>
                        <h2 style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>Submit a video to the team</h2>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                {done ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center' }}>
                        <span style={{ width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}><CheckCircle2 size={28} /></span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Request sent</div>
                            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>The team has received your request and will pick it up shortly.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <button className="pc-btn pc-btn-quiet" onClick={() => { setDone(false); setTitle(''); setRawLink(''); setBrollLink(''); setNotes('') }}>Submit another</button>
                            <button className="pc-btn pc-btn-primary" onClick={onClose}>Done</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {loading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: 'var(--fg-3)' }}><Loader2 className="animate-spin" size={22} /></div>
                            ) : (
                                <>
                                    {opts && opts.workspaces.length > 1 && (
                                        <div>
                                            <label style={labelStyle}>Period / Month</label>
                                            <select className="pc-input" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
                                                {opts.workspaces.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    {opts && opts.brands.length > 1 && (
                                        <div>
                                            <label style={labelStyle}>Brand</label>
                                            <select className="pc-input" value={clientId} onChange={(e) => setClientId(Number(e.target.value))}>
                                                {opts.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                            </select>
                                        </div>
                                    )}
                                    <div>
                                        <label style={labelStyle}>Project / video name <span style={{ color: 'var(--danger)' }}>*</span></label>
                                        <input className="pc-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Video 5 — The 'I'm Not Ready' Myth" maxLength={200} autoFocus />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Raw footage link <span style={{ color: 'var(--danger)' }}>*</span></label>
                                        <input className="pc-input" value={rawLink} onChange={(e) => setRawLink(e.target.value)} placeholder="https://drive.google.com/…" inputMode="url" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>B-roll / audio link <span style={{ fontWeight: 500, color: 'var(--fg-3)' }}>(optional)</span></label>
                                        <input className="pc-input" value={brollLink} onChange={(e) => setBrollLink(e.target.value)} placeholder="https://…" inputMode="url" />
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Notes / requirements <span style={{ fontWeight: 500, color: 'var(--fg-3)' }}>(optional)</span></label>
                                        <textarea className="pc-input" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder="Anything the editor should know — tone, references, must-keep moments…" style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
                                    </div>
                                    {err && <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)', borderRadius: 10, padding: '9px 12px' }}>{err}</div>}
                                </>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--line)' }}>
                            <button className="pc-btn pc-btn-quiet" disabled={busy} onClick={onClose} style={{ flex: '0 0 auto' }}>Cancel</button>
                            <button className="pc-btn pc-btn-primary" disabled={!canSubmit} onClick={submit} style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
                                {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />}
                                {busy ? 'Sending…' : 'Send request'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
