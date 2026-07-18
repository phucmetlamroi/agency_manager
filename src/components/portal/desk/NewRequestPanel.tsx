'use client'

/* THE DESK — New request wizard (5 steps: General → Videos → Assets → Brief →
   Review). A guided brief to the studio → submitClientRequestViaToken. Step 1
   can spin up a new channel inline via createSubClient. Same token adapter, same
   fields as the compact form — just paced. */

import { useEffect, useMemo, useState } from 'react'
import { Send, Loader, ArrowLeft, ArrowRight, Check, Plus, X } from 'lucide-react'
import { Sheet, SheetHeader, Button, Kicker, useToast } from './ui'
import type { DeliverableActions } from '../calm/types'

type Options = { workspaces: { id: string; label: string }[]; brands: { id: number; name: string }[]; clientName?: string }

const STEPS = ['General', 'Videos', 'Assets', 'Brief', 'Review'] as const
const looksHttp = (v: string) => /^https?:\/\/\S+/i.test(v.trim())

export default function NewRequestPanel({ actions, onClose }: { actions: DeliverableActions; onClose: () => void }) {
    const toast = useToast()
    const [opts, setOpts] = useState<Options | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [done, setDone] = useState(false)
    const [step, setStep] = useState(0) // 0..4

    // form
    const [workspaceId, setWorkspaceId] = useState('')
    const [clientId, setClientId] = useState<number | ''>('')
    const [title, setTitle] = useState('')
    const [desiredType, setDesiredType] = useState('')
    const [desiredDeadline, setDesiredDeadline] = useState('')
    const [videoList, setVideoList] = useState('')
    const [rawFootage, setRawFootage] = useState('')
    const [collectFile, setCollectFile] = useState('')
    const [bRoll, setBRoll] = useState('')
    const [submitFolder, setSubmitFolder] = useState('')
    const [script, setScript] = useState('')
    const [references, setReferences] = useState('')
    const [notes, setNotes] = useState('')

    // add-channel inline
    const [addingChannel, setAddingChannel] = useState(false)
    const [newChannel, setNewChannel] = useState('')
    const [creatingChannel, setCreatingChannel] = useState(false)

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

    const step1Ok = !!workspaceId && clientId !== '' && !!title.trim()
    const step3Ok = looksHttp(rawFootage)
    const canSubmit = step1Ok && step3Ok && !busy

    // Gate advancing out of a required step.
    const canAdvance = useMemo(() => {
        if (step === 0) return step1Ok
        if (step === 2) return step3Ok
        return true
    }, [step, step1Ok, step3Ok])

    const createChannel = async () => {
        const name = newChannel.trim()
        if (!name || creatingChannel || !actions.createSubClient) return
        const parentId = clientId !== '' ? Number(clientId) : (opts?.brands[0]?.id)
        if (parentId == null) { toast('err', 'Pick a channel to nest under first.'); return }
        setCreatingChannel(true)
        const res = await actions.createSubClient({ name, parentId })
        setCreatingChannel(false)
        if (res && res.success !== false && res.clientId) {
            setOpts(o => o ? { ...o, brands: [...o.brands, { id: res.clientId!, name: res.name || name }] } : o)
            setClientId(res.clientId)
            setAddingChannel(false); setNewChannel('')
            toast('ok', 'Channel added.')
        } else toast('err', (res && res.error) || 'Could not add the channel.')
    }

    const submit = async () => {
        if (!canSubmit || !actions.submitRequest) return
        setBusy(true)
        const res = await actions.submitRequest({
            workspaceId,
            clientId: Number(clientId),
            title: title.trim(),
            rawFootage: rawFootage.trim(),
            videoList: videoList.trim() || undefined,
            desiredType: desiredType.trim() || undefined,
            desiredDeadline: desiredDeadline || undefined,
            collectFile: collectFile.trim() || undefined,
            bRoll: bRoll.trim() || undefined,
            submitFolder: submitFolder.trim() || undefined,
            script: script.trim() || undefined,
            references: references.trim() || undefined,
            notes: notes.trim() || undefined,
        })
        setBusy(false)
        if (res && res.success !== false) { setDone(true); toast('ok', 'Request sent — the studio will reply here.') }
        else toast('err', (res && res.error) || 'Could not send your request.')
    }

    const next = () => {
        if (!canAdvance) return
        // jumping to Review requires the required steps done
        if (step === STEPS.length - 2 && !(step1Ok && step3Ok)) { toast('err', 'Add a title and a footage link first.'); return }
        setStep(s => Math.min(s + 1, STEPS.length - 1))
    }
    const back = () => setStep(s => Math.max(s - 1, 0))

    const noChannels = !opts || opts.brands.length === 0

    return (
        <Sheet onClose={onClose} width={580} label="New request">
            <SheetHeader
                kicker={done ? 'New request' : `New request · Step ${step + 1} of ${STEPS.length}`}
                title={done ? 'Request sent.' : 'Ask the studio for new work.'}
                onClose={onClose}
            />

            {!loading && !done && !noChannels && <Stepper step={step} onJump={(i) => { if (i < step || (step1Ok && step3Ok) || i <= step) setStep(i) }} />}

            <div style={{ flex: 1, overflowY: 'auto', padding: 22 }}>
                {loading ? (
                    <Loading />
                ) : done ? (
                    <DoneState onClose={onClose} />
                ) : noChannels ? (
                    <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>We couldn’t load your channels right now. Please try again in a moment.</p>
                ) : (
                    <div style={{ display: 'grid', gap: 18 }}>
                        {step === 0 && (
                            <>
                                <Field label="Project title" required>
                                    <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Q3 brand film — 60s cutdown" className="desk-input" autoFocus />
                                </Field>
                                <div className="desk-field-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    {opts!.workspaces.length > 0 && (
                                        <Field label="Period">
                                            <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} className="desk-input">
                                                {opts!.workspaces.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
                                            </select>
                                        </Field>
                                    )}
                                    <Field label="Channel" required>
                                        <select value={clientId} onChange={e => setClientId(Number(e.target.value))} className="desk-input">
                                            {opts!.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                        </select>
                                    </Field>
                                </div>

                                {actions.createSubClient && (
                                    addingChannel ? (
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                                            <label style={{ flex: 1 }}>
                                                <Kicker style={{ marginBottom: 7 }}>New channel name</Kicker>
                                                <input value={newChannel} onChange={e => setNewChannel(e.target.value)} placeholder="e.g. Retail · Instagram" className="desk-input" autoFocus onKeyDown={e => { if (e.key === 'Enter') createChannel() }} />
                                            </label>
                                            <Button variant="primary" disabled={creatingChannel || !newChannel.trim()} onClick={createChannel}>{creatingChannel ? '…' : 'Add'}</Button>
                                            <Button variant="quiet" onClick={() => { setAddingChannel(false); setNewChannel('') }} aria-label="Cancel"><X size={15} /></Button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setAddingChannel(true)} style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                                            <Plus size={14} /> New channel
                                        </button>
                                    )
                                )}

                                <div className="desk-field-pair" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                    <Field label="Kind of video">
                                        <input value={desiredType} onChange={e => setDesiredType(e.target.value)} placeholder="Reel, long-form, podcast…" className="desk-input" />
                                    </Field>
                                    <Field label="Ideal deadline">
                                        <input type="date" value={desiredDeadline} onChange={e => setDesiredDeadline(e.target.value)} className="desk-input" />
                                    </Field>
                                </div>
                            </>
                        )}

                        {step === 1 && (
                            <Field label="Video list" hint="One per line — the videos you’d like from this brief (optional).">
                                <textarea value={videoList} onChange={e => setVideoList(e.target.value)} rows={6} className="desk-input" placeholder={'Hero cut — 60s\nVertical cutdown — 15s\nTeaser — 6s'} />
                            </Field>
                        )}

                        {step === 2 && (
                            <>
                                <Field label="Footage / raw files" required hint="A link the studio can open — Drive, Dropbox, WeTransfer…">
                                    <input value={rawFootage} onChange={e => setRawFootage(e.target.value)} placeholder="https://…" className="desk-input" autoFocus />
                                    {rawFootage.trim() && !step3Ok && <p style={{ margin: '6px 0 0', fontSize: '0.74rem', color: 'var(--brick)' }}>Must start with http:// or https://</p>}
                                </Field>
                                <Field label="Collect files" hint="Optional"><input value={collectFile} onChange={e => setCollectFile(e.target.value)} placeholder="https://…" className="desk-input" /></Field>
                                <Field label="B-roll" hint="Optional"><input value={bRoll} onChange={e => setBRoll(e.target.value)} placeholder="https://…" className="desk-input" /></Field>
                                <Field label="Submission folder" hint="Optional"><input value={submitFolder} onChange={e => setSubmitFolder(e.target.value)} placeholder="https://…" className="desk-input" /></Field>
                                <Field label="Script" hint="Optional"><input value={script} onChange={e => setScript(e.target.value)} placeholder="https://…" className="desk-input" /></Field>
                            </>
                        )}

                        {step === 3 && (
                            <>
                                <Field label="References" hint="Links to styles or edits you like (optional).">
                                    <textarea value={references} onChange={e => setReferences(e.target.value)} rows={2} className="desk-input" placeholder="https://…" />
                                </Field>
                                <Field label="Brief / notes" hint="Tone, must-haves, deliverable specs — anything the studio should know.">
                                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={5} className="desk-input" placeholder="What’s the goal, who’s it for, any non-negotiables…" />
                                </Field>
                            </>
                        )}

                        {step === 4 && (
                            <Review
                                rows={[
                                    ['Title', title || '—'],
                                    ['Channel', opts!.brands.find(b => b.id === clientId)?.name || '—'],
                                    ['Period', opts!.workspaces.find(w => w.id === workspaceId)?.label || '—'],
                                    ['Kind of video', desiredType || '—'],
                                    ['Ideal deadline', desiredDeadline || '—'],
                                    ['Video list', videoList.trim() || '—'],
                                    ['Footage', rawFootage.trim() || '—'],
                                    ['Collect files', collectFile.trim() || '—'],
                                    ['B-roll', bRoll.trim() || '—'],
                                    ['Submission folder', submitFolder.trim() || '—'],
                                    ['Script', script.trim() || '—'],
                                    ['References', references.trim() || '—'],
                                    ['Brief / notes', notes.trim() || '—'],
                                ]}
                            />
                        )}
                    </div>
                )}
            </div>

            {!loading && !done && !noChannels && (
                <div style={{ padding: '16px 22px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    {step > 0 ? <Button variant="quiet" onClick={back}><ArrowLeft size={15} /> Back</Button> : <span />}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                        {step < STEPS.length - 1
                            ? <Button variant="primary" onClick={next} disabled={!canAdvance}>Next <ArrowRight size={15} /></Button>
                            : <Button variant="primary" onClick={submit} disabled={!canSubmit}><Send size={15} /> Send request</Button>}
                    </span>
                </div>
            )}
        </Sheet>
    )
}

/* ── Stepper ─────────────────────────────────────────────────────────────── */
function Stepper({ step, onJump }: { step: number; onJump: (i: number) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '14px 22px', borderBottom: '1px solid var(--hairline-faint)' }}>
            {STEPS.map((label, i) => {
                const state = i < step ? 'done' : i === step ? 'active' : 'todo'
                const color = state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--sage)' : 'var(--ink-3)'
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : '0 0 auto', minWidth: 0 }}>
                        <button onClick={() => onJump(i)} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                            <span style={{
                                width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontFamily: 'var(--font-mono)', fontSize: '0.64rem', fontWeight: 700,
                                background: state === 'active' ? 'var(--accent)' : state === 'done' ? 'var(--sage-tint)' : 'var(--paper-sunken)',
                                color: state === 'active' ? 'var(--on-accent)' : color,
                                border: '1px solid ' + (state === 'todo' ? 'var(--hairline)' : 'transparent'),
                            }}>
                                {state === 'done' ? <Check size={12} /> : i + 1}
                            </span>
                            <span className="desk-truncate" style={{ fontSize: '0.74rem', fontWeight: state === 'active' ? 700 : 500, color, letterSpacing: '0.01em' }}>{label}</span>
                        </button>
                        {i < STEPS.length - 1 && <span style={{ flex: 1, height: 1, margin: '0 8px', background: i < step ? 'var(--sage)' : 'var(--hairline)' }} />}
                    </div>
                )
            })}
        </div>
    )
}

function Review({ rows }: { rows: [string, string][] }) {
    return (
        <div>
            <Kicker accent style={{ marginBottom: 12 }}>Review &amp; send</Kicker>
            <p style={{ fontSize: '0.86rem', color: 'var(--ink-2)', margin: '0 0 16px' }}>Here’s what the studio will receive. Go back to change anything.</p>
            <div style={{ border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden', background: 'var(--paper-raised)' }}>
                {rows.map(([k, v], i) => (
                    <div key={k} style={{ display: 'grid', gridTemplateColumns: '128px 1fr', gap: 12, padding: '10px 14px', borderTop: i ? '1px solid var(--hairline-faint)' : 'none' }}>
                        <span className="kicker" style={{ fontSize: '0.6rem' }}>{k}</span>
                        <span style={{ fontSize: '0.86rem', color: v === '—' ? 'var(--ink-3)' : 'var(--ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{v}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Loading() {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
            <Loader size={16} className="desk-spin" /> <span style={{ fontSize: '0.86rem' }}>Loading your channels…</span>
        </div>
    )
}

function DoneState({ onClose }: { onClose: () => void }) {
    return (
        <div style={{ textAlign: 'center', padding: '30px 10px' }}>
            <div style={{ width: 46, height: 46, margin: '0 auto 14px', borderRadius: '50%', background: 'var(--sage-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={19} style={{ color: 'var(--sage)' }} />
            </div>
            <h3 className="desk-display" style={{ fontSize: '1.15rem', margin: '0 0 6px' }}>Request sent.</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', maxWidth: 380, margin: '0 auto 20px' }}>We’ve got it. The studio will scope it and reply with a plan and a price — you’ll see it under “Your requests”.</p>
            <Button variant="secondary" onClick={onClose}>Done</Button>
        </div>
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
