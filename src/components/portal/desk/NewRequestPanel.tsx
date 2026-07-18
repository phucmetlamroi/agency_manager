'use client'

/* THE DESK — New request panel. A brief to the studio → submitClientRequestViaToken.
   Compact single-panel form (the required asset links + intent); the studio scopes
   and prices it on the other side. */

import { useEffect, useState } from 'react'
import { Send, Loader } from 'lucide-react'
import { Sheet, SheetHeader, Button, Kicker, useToast } from './ui'
import type { DeliverableActions } from '../calm/types'

type Options = { workspaces: { id: string; label: string }[]; brands: { id: number; name: string }[]; clientName?: string }

export default function NewRequestPanel({ actions, onClose }: { actions: DeliverableActions; onClose: () => void }) {
    const toast = useToast()
    const [opts, setOpts] = useState<Options | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)

    const [workspaceId, setWorkspaceId] = useState('')
    const [clientId, setClientId] = useState<number | ''>('')
    const [title, setTitle] = useState('')
    const [rawFootage, setRawFootage] = useState('')
    const [desiredType, setDesiredType] = useState('')
    const [desiredDeadline, setDesiredDeadline] = useState('')
    const [references, setReferences] = useState('')
    const [notes, setNotes] = useState('')

    useEffect(() => {
        if (!actions.getSubmitOptions) { setLoading(false); return }
        actions.getSubmitOptions().then(o => {
            if (o) {
                setOpts(o)
                if (o.workspaces[0]) setWorkspaceId(o.workspaces[0].id)
                if (o.brands[0]) setClientId(o.brands[0].id)
            }
            setLoading(false)
        }).catch(() => setLoading(false))
        // eslint-disable-next-line
    }, [])

    const canSubmit = !!workspaceId && clientId !== '' && title.trim() && rawFootage.trim() && !busy

    const submit = async () => {
        if (!canSubmit || !actions.submitRequest) return
        setBusy(true)
        const res = await actions.submitRequest({
            workspaceId,
            clientId: Number(clientId),
            title: title.trim(),
            rawFootage: rawFootage.trim(),
            desiredType: desiredType.trim() || undefined,
            desiredDeadline: desiredDeadline || undefined,
            references: references.trim() || undefined,
            notes: notes.trim() || undefined,
        })
        setBusy(false)
        if (res && res.success !== false) { setDone(true); toast('ok', 'Request sent — the studio will reply here.') }
        else toast('err', (res && res.error) || 'Could not send your request.')
    }

    return (
        <Sheet onClose={onClose} width={560} label="New request">
            <SheetHeader kicker="New request" title="Ask the studio for new work." onClose={onClose} />

            <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
                        <Loader size={16} className="desk-spin" /> <span style={{ fontSize: '0.86rem' }}>Loading your channels…</span>
                    </div>
                ) : done ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                        <div style={{ width: 46, height: 46, margin: '0 auto 14px', borderRadius: '50%', background: 'var(--sage-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Send size={19} style={{ color: 'var(--sage)' }} />
                        </div>
                        <h3 className="desk-display" style={{ fontSize: '1.15rem', margin: '0 0 6px' }}>Request sent.</h3>
                        <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', maxWidth: 380, margin: '0 auto 20px' }}>We’ve got it. The studio will scope it and reply with a plan and a price.</p>
                        <Button variant="secondary" onClick={onClose}>Done</Button>
                    </div>
                ) : !opts || opts.brands.length === 0 ? (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>We couldn’t load your channels right now. Please try again in a moment.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 18 }}>
                        <Field label="Title" required>
                            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q3 brand film — 60s cutdown" className="desk-input" autoFocus />
                        </Field>

                        <div className="desk-field-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            {opts.workspaces.length > 0 && (
                                <Field label="Period">
                                    <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} className="desk-input">
                                        {opts.workspaces.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="Channel">
                                <select value={clientId} onChange={e => setClientId(Number(e.target.value))} className="desk-input">
                                    {opts.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </Field>
                        </div>

                        <Field label="Footage / raw files" required hint="A link the studio can open — Drive, Dropbox, WeTransfer…">
                            <input value={rawFootage} onChange={e => setRawFootage(e.target.value)} placeholder="https://…" className="desk-input" />
                        </Field>

                        <div className="desk-field-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                            <Field label="Kind of video">
                                <input value={desiredType} onChange={e => setDesiredType(e.target.value)} placeholder="Reel, long-form, podcast…" className="desk-input" />
                            </Field>
                            <Field label="Ideal deadline">
                                <input type="date" value={desiredDeadline} onChange={e => setDesiredDeadline(e.target.value)} className="desk-input" />
                            </Field>
                        </div>

                        <Field label="References" hint="Links to styles or edits you like (optional).">
                            <textarea value={references} onChange={e => setReferences(e.target.value)} rows={2} className="desk-input" placeholder="https://…" />
                        </Field>

                        <Field label="Anything else" hint="Notes for the studio (optional).">
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="desk-input" placeholder="Tone, must-haves, deliverable specs…" />
                        </Field>
                    </div>
                )}
            </div>

            {!loading && !done && opts && opts.brands.length > 0 && (
                <div style={{ padding: '16px 22px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--ink-3)' }}>The studio replies with a plan and a price.</span>
                    <Button variant="primary" onClick={submit} disabled={!canSubmit} style={{ marginLeft: 'auto' }}><Send size={15} /> Send request</Button>
                </div>
            )}
        </Sheet>
    )
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <label style={{ display: 'block' }}>
            <Kicker style={{ marginBottom: 7 }}>{label}{required && <span style={{ color: 'var(--accent)' }}> ·</span>}</Kicker>
            {children}
            {hint && <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: 'var(--ink-3)' }}>{hint}</p>}
        </label>
    )
}
