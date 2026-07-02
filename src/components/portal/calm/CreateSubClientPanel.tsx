'use client'

/**
 * [Client Task Submission v2] Client-facing "New brand" panel — lets a client
 * create a sub-brand (child) under one of their in-scope brands, the same way an
 * admin does. Light "Daylight Atelier" skin. Token-gated via actions.createSubClient
 * (parent must be in scope; profileId forced server-side). The new brand appears
 * in the pickers on the next load (scope resolves it via name-path).
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Plus, CheckCircle2, Loader2 } from 'lucide-react'
import PortalAutocomplete from './PortalAutocomplete'
import type { DeliverableActions } from './types'

export default function CreateSubClientPanel({ actions, onClose }: {
    actions: DeliverableActions
    onClose: () => void
}) {
    const [brands, setBrands] = useState<{ id: number; name: string }[] | null>(null)
    const [loading, setLoading] = useState(true)
    const [parentId, setParentId] = useState<number | ''>('')
    const [name, setName] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [done, setDone] = useState<string | null>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    useEffect(() => {
        let alive = true
        if (!actions.getSubmitOptions) { setLoading(false); return }
        actions.getSubmitOptions()
            .then((res) => {
                if (!alive) return
                if (res) { setBrands(res.brands); setParentId(res.brands[0]?.id ?? '') }
                setLoading(false)
            })
            .catch(() => { if (alive) { setErr('Could not load brands. Please reload.'); setLoading(false) } })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const brandOptions = useMemo(() => (brands ?? []).map((b) => ({ id: String(b.id), label: b.name })), [brands])
    const canSubmit = !busy && parentId !== '' && !!name.trim()

    const submit = async () => {
        if (!canSubmit || !actions.createSubClient) return
        setBusy(true); setErr(null)
        const res = await actions.createSubClient({ name: name.trim(), parentId: Number(parentId) })
        setBusy(false)
        if (res?.success) { setDone(res.name || name.trim()); setName('') }
        else setErr(res?.error || 'Could not create the brand. Please try again.')
    }

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.35)', zIndex: 80 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '94vw', zIndex: 81, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>Brands</div>
                        <h2 style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>Add a new brand</h2>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                {done ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center' }}>
                        <span style={{ width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}><CheckCircle2 size={28} /></span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Brand created</div>
                            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>“{done}” was added. It will appear in your brand list shortly.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <button className="pc-btn pc-btn-quiet" onClick={() => setDone(null)}>Add another</button>
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
                                    <div>
                                        <label style={labelStyle}>Parent brand <span style={{ color: 'var(--danger, #C2562F)' }}>*</span></label>
                                        <PortalAutocomplete
                                            selectedId={parentId === '' ? '' : String(parentId)}
                                            onSelect={(id) => setParentId(id ? Number(id) : '')}
                                            options={brandOptions}
                                            placeholder="Search a brand…"
                                        />
                                        <p style={{ margin: '7px 0 0', fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>The new brand becomes a channel under this one.</p>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>New brand name <span style={{ color: 'var(--danger, #C2562F)' }}>*</span></label>
                                        <input className="pc-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Campaign" maxLength={120} autoFocus />
                                    </div>
                                    {err && <div style={{ fontSize: 13, color: 'var(--danger, #C2562F)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '9px 12px' }}>{err}</div>}
                                </>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--line)' }}>
                            <button className="pc-btn pc-btn-quiet" disabled={busy} onClick={onClose} style={{ flex: '0 0 auto' }}>Cancel</button>
                            <button className="pc-btn pc-btn-primary" disabled={!canSubmit} onClick={submit} style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
                                {busy ? <Loader2 className="animate-spin" size={16} /> : <Plus size={15} />}
                                {busy ? 'Creating…' : 'Create brand'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
