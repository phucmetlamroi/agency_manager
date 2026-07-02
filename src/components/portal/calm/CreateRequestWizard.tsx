'use client'

/**
 * [Client Task Submission v2] The client-facing 5-step request wizard — a light
 * "Daylight Atelier" mirror of the admin AddTaskModal, in English, with the
 * Finance / assignee / Frame-credential fields stripped (leak discipline).
 *
 * Steps: General → Videos → Assets → Brief → Review. Submitting calls the
 * token-gated actions.submitRequest, which creates a ClientTaskRequest (NOT a
 * Task) and emails the profile admins. Every entity picker is a searchable
 * PortalAutocomplete rather than a long dropdown.
 *
 * Close UX matches the rest of the portal (scrim click + Escape) and the panel
 * UNMOUNTS on close so state resets synchronously.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, Send, CheckCircle2, Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import PortalAutocomplete from './PortalAutocomplete'
import type { DeliverableActions } from './types'

type Options = { workspaces: { id: string; label: string }[]; brands: { id: number; name: string }[] }

const STEPS = ['General', 'Videos', 'Assets', 'Brief', 'Review'] as const
const TYPES = ['Short form', 'Long form', 'Trial'] as const
const isUrl = (s: string) => /^https?:\/\/\S+$/i.test(s.trim())

export default function CreateRequestWizard({ actions, onClose }: {
    actions: DeliverableActions
    onClose: () => void
}) {
    const [opts, setOpts] = useState<Options | null>(null)
    const [loading, setLoading] = useState(true)
    const [step, setStep] = useState(0)

    // Form state
    const [workspaceId, setWorkspaceId] = useState('')
    const [clientId, setClientId] = useState<number | ''>('')
    const [title, setTitle] = useState('')
    const [desiredType, setDesiredType] = useState('')
    const [desiredDeadline, setDesiredDeadline] = useState('')
    const [videoList, setVideoList] = useState('')
    const [rawFootage, setRawFootage] = useState('')
    const [collectFile, setCollectFile] = useState('')
    const [bRoll, setBRoll] = useState('')
    const [references, setReferences] = useState('')
    const [submitFolder, setSubmitFolder] = useState('')
    const [script, setScript] = useState('')
    const [notes, setNotes] = useState('')

    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [done, setDone] = useState(false)

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

    const brandOptions = useMemo(() => (opts?.brands ?? []).map((b) => ({ id: String(b.id), label: b.name })), [opts])
    const wsOptions = useMemo(() => (opts?.workspaces ?? []).map((w) => ({ id: w.id, label: w.label })), [opts])

    // Per-step validity (gates Next / Submit).
    const step0ok = clientId !== '' && !!workspaceId && !!title.trim()
    const optUrlsOk = [collectFile, bRoll, references, submitFolder, script].every((v) => !v.trim() || isUrl(v))
    const step2ok = isUrl(rawFootage) && optUrlsOk
    const stepValid = (s: number) => (s === 0 ? step0ok : s === 2 ? step2ok : true)
    const canSubmit = step0ok && step2ok && !busy

    const goNext = () => { if (stepValid(step) && step < STEPS.length - 1) setStep(step + 1) }
    const goBack = () => { if (step > 0) setStep(step - 1) }

    const submit = async () => {
        if (!canSubmit || !actions.submitRequest) return
        setBusy(true); setErr(null)
        const res = await actions.submitRequest({
            workspaceId,
            clientId: Number(clientId),
            title: title.trim(),
            videoList: videoList.trim() || undefined,
            desiredType: desiredType || undefined,
            desiredDeadline: desiredDeadline || undefined,
            rawFootage: rawFootage.trim(),
            collectFile: collectFile.trim() || undefined,
            bRoll: bRoll.trim() || undefined,
            references: references.trim() || undefined,
            submitFolder: submitFolder.trim() || undefined,
            script: script.trim() || undefined,
            notes: notes.trim() || undefined,
        })
        setBusy(false)
        if (res?.success) setDone(true)
        else setErr(res?.error || 'Could not send your request. Please try again.')
    }

    const resetForm = () => {
        setDone(false); setStep(0); setErr(null)
        setTitle(''); setDesiredType(''); setDesiredDeadline(''); setVideoList('')
        setRawFootage(''); setCollectFile(''); setBRoll(''); setReferences(''); setSubmitFolder(''); setScript(''); setNotes('')
    }

    const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--fg-2)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }
    const optHint = <span style={{ fontWeight: 500, color: 'var(--fg-3)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
    const req = <span style={{ color: 'var(--danger, #C2562F)' }}>*</span>

    const videoCount = videoList.split('\n').map((l) => l.trim()).filter(Boolean).length

    const urlField = (label: React.ReactNode, value: string, set: (v: string) => void, ph: string) => (
        <div>
            <label style={labelStyle}>{label}</label>
            <input
                className="pc-input"
                value={value}
                onChange={(e) => set(e.target.value)}
                placeholder={ph}
                inputMode="url"
                style={value.trim() && !isUrl(value) ? { borderColor: 'var(--accent-line)' } : undefined}
            />
        </div>
    )

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.35)', zIndex: 80 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, maxWidth: '96vw', zIndex: 81, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="eyebrow" style={{ fontSize: 10 }}>New request</div>
                            <h2 style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>Submit a request to the team</h2>
                        </div>
                        <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                    </div>

                    {!done && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 14 }}>
                            {STEPS.map((s, i) => {
                                const on = i === step
                                const passed = i < step
                                return (
                                    <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <div style={{ height: 3, borderRadius: 2, background: on || passed ? 'var(--accent)' : 'var(--surface-3)' }} />
                                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', color: on ? 'var(--accent-fg)' : passed ? 'var(--fg-2)' : 'var(--fg-4)' }}>{s}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {done ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center' }}>
                        <span style={{ width: 56, height: 56, borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}><CheckCircle2 size={28} /></span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)' }}>Request sent</div>
                            <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>The team has received your request and will review it shortly.</p>
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <button className="pc-btn pc-btn-quiet" onClick={resetForm}>Submit another</button>
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
                                    {/* ── Step 0: General ── */}
                                    {step === 0 && (
                                        <>
                                            {brandOptions.length > 1 && (
                                                <div>
                                                    <label style={labelStyle}>Brand {req}</label>
                                                    <PortalAutocomplete
                                                        selectedId={clientId === '' ? '' : String(clientId)}
                                                        onSelect={(id) => setClientId(id ? Number(id) : '')}
                                                        options={brandOptions}
                                                        placeholder="Search a brand…"
                                                    />
                                                </div>
                                            )}
                                            {wsOptions.length > 1 && (
                                                <div>
                                                    <label style={labelStyle}>Period / Month {req}</label>
                                                    <PortalAutocomplete
                                                        selectedId={workspaceId}
                                                        onSelect={(id) => setWorkspaceId(id)}
                                                        options={wsOptions}
                                                        placeholder="Search a period…"
                                                    />
                                                </div>
                                            )}
                                            <div>
                                                <label style={labelStyle}>Project name {req}</label>
                                                <input className="pc-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. April short-form batch" maxLength={200} autoFocus />
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Video type {optHint}</label>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {TYPES.map((t) => (
                                                        <button
                                                            key={t}
                                                            type="button"
                                                            className="pc-seg"
                                                            data-on={desiredType === t}
                                                            onClick={() => setDesiredType(desiredType === t ? '' : t)}
                                                            style={{ padding: '8px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                                                        >
                                                            {t}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label style={labelStyle}>Preferred deadline {optHint}</label>
                                                <input type="datetime-local" className="pc-input" value={desiredDeadline} onChange={(e) => setDesiredDeadline(e.target.value)} />
                                            </div>
                                        </>
                                    )}

                                    {/* ── Step 1: Videos ── */}
                                    {step === 1 && (
                                        <div>
                                            <label style={labelStyle}>Videos {optHint}</label>
                                            <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--fg-3)', lineHeight: 1.5 }}>One per line — the individual videos you want made in this request.</p>
                                            <textarea
                                                className="pc-input"
                                                value={videoList}
                                                onChange={(e) => setVideoList(e.target.value)}
                                                rows={7}
                                                placeholder={"Video 1 — Hook A\nVideo 2 — Hook B\nVideo 3 — …"}
                                                style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                                            />
                                            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--fg-3)' }}>{videoCount} video{videoCount === 1 ? '' : 's'}</div>
                                        </div>
                                    )}

                                    {/* ── Step 2: Assets ── */}
                                    {step === 2 && (
                                        <>
                                            {urlField(<>Raw footage link {req}</>, rawFootage, setRawFootage, 'https://drive.google.com/…')}
                                            {urlField(<>Collect files link {optHint}</>, collectFile, setCollectFile, 'https://…')}
                                            {urlField(<>B-roll link {optHint}</>, bRoll, setBRoll, 'https://…')}
                                            {urlField(<>References link {optHint}</>, references, setReferences, 'https://…')}
                                            {urlField(<>Submission folder {optHint}</>, submitFolder, setSubmitFolder, 'https://…')}
                                            {urlField(<>Script link {optHint}</>, script, setScript, 'https://…')}
                                            {rawFootage.trim() && !isUrl(rawFootage) && (
                                                <div style={{ fontSize: 12.5, color: 'var(--accent-fg)' }}>The raw footage link must start with http:// or https://</div>
                                            )}
                                        </>
                                    )}

                                    {/* ── Step 3: Brief ── */}
                                    {step === 3 && (
                                        <div>
                                            <label style={labelStyle}>Brief / requirements {optHint}</label>
                                            <textarea
                                                className="pc-input"
                                                value={notes}
                                                onChange={(e) => setNotes(e.target.value)}
                                                rows={8}
                                                placeholder="Anything the editor should know — tone, references, must-keep moments, do's and don'ts…"
                                                style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'inherit' }}
                                            />
                                        </div>
                                    )}

                                    {/* ── Step 4: Review ── */}
                                    {step === 4 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                            <ReviewRow label="Brand" value={opts?.brands.find((b) => b.id === clientId)?.name ?? '—'} />
                                            {wsOptions.length > 1 && <ReviewRow label="Period" value={opts?.workspaces.find((w) => w.id === workspaceId)?.label ?? '—'} />}
                                            <ReviewRow label="Project" value={title.trim() || '—'} />
                                            {desiredType && <ReviewRow label="Type" value={desiredType} />}
                                            {desiredDeadline && <ReviewRow label="Deadline" value={desiredDeadline.replace('T', ' ')} />}
                                            {videoCount > 0 && <ReviewRow label="Videos" value={`${videoCount}`} />}
                                            <ReviewRow label="Raw footage" value={rawFootage.trim() || '—'} link />
                                            {collectFile.trim() && <ReviewRow label="Collect files" value={collectFile.trim()} link />}
                                            {bRoll.trim() && <ReviewRow label="B-roll" value={bRoll.trim()} link />}
                                            {references.trim() && <ReviewRow label="References" value={references.trim()} link />}
                                            {submitFolder.trim() && <ReviewRow label="Submission" value={submitFolder.trim()} link />}
                                            {script.trim() && <ReviewRow label="Script" value={script.trim()} link />}
                                            {notes.trim() && <ReviewRow label="Brief" value={notes.trim()} />}
                                        </div>
                                    )}

                                    {err && <div style={{ fontSize: 13, color: 'var(--danger, #C2562F)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 10, padding: '9px 12px' }}>{err}</div>}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', gap: 10, padding: 16, borderTop: '1px solid var(--line)' }}>
                            <button className="pc-btn pc-btn-quiet" disabled={busy} onClick={step === 0 ? onClose : goBack} style={{ flex: '0 0 auto', gap: 6 }}>
                                {step === 0 ? 'Cancel' : (<><ArrowLeft size={15} /> Back</>)}
                            </button>
                            {step < STEPS.length - 1 ? (
                                <button className="pc-btn pc-btn-primary" disabled={!stepValid(step)} onClick={goNext} style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
                                    Continue <ArrowRight size={15} />
                                </button>
                            ) : (
                                <button className="pc-btn pc-btn-primary" disabled={!canSubmit} onClick={submit} style={{ flex: 1, justifyContent: 'center', gap: 7 }}>
                                    {busy ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />}
                                    {busy ? 'Sending…' : 'Send request'}
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    )
}

function ReviewRow({ label, value, link }: { label: string; value: string; link?: boolean }) {
    return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 96px', fontSize: 11.5, fontWeight: 700, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: '0.03em', paddingTop: 1 }}>{label}</div>
            {link && /^https?:\/\//i.test(value) ? (
                <a href={value} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--accent-fg)', wordBreak: 'break-all' }}>{value}</a>
            ) : (
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</div>
            )}
        </div>
    )
}
