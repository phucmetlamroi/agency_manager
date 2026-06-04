'use client'

import { useEffect, useState } from 'react'
import {
    X, Play, FolderOpen, ExternalLink, Clock, Check, RotateCcw, Info, CheckCircle2,
    Download, KeyRound, Star,
} from 'lucide-react'
import { PipelineTracker } from './ui'
import { fmtDate, relDeadline } from './format'
import {
    approveDeliverable, requestDeliverableChanges, getDeliverableActivity, submitTaskRating,
} from '@/actions/client-portal-actions'
import type { Deliverable, ActivityItem } from './types'

export default function DeliverableDetailPanel({ d, workspaceId, onClose, onUpdated }: {
    d: Deliverable
    workspaceId: string
    onClose: () => void
    onUpdated: (id: string, patch: Partial<Deliverable>) => void
}) {
    const [mode, setMode] = useState<null | 'changes'>(null)
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [activity, setActivity] = useState<ActivityItem[]>([])
    const [showCreds, setShowCreds] = useState(false)

    const brandName = d.client?.name || '—'
    const rel = d.clientStatus === 'Completed' ? null : relDeadline(d.deadline)

    useEffect(() => {
        let alive = true
        getDeliverableActivity(d.id).then(rows => { if (alive) setActivity(rows) }).catch(() => { })
        return () => { alive = false }
    }, [d.id])

    const approve = async () => {
        setBusy(true); setErr(null)
        const res = await approveDeliverable(d.id, workspaceId)
        setBusy(false)
        if ('success' in res && res.success) {
            onUpdated(d.id, { status: 'Hoàn tất', clientStatus: 'Completed', needsYou: false, clientReview: 'APPROVED' })
            getDeliverableActivity(d.id).then(setActivity).catch(() => { })
        } else setErr(('error' in res && res.error) || 'Không thể duyệt.')
    }

    const requestChanges = async () => {
        if (!notes.trim()) return
        setBusy(true); setErr(null)
        const res = await requestDeliverableChanges(d.id, workspaceId, notes.trim())
        setBusy(false)
        if ('success' in res && res.success) {
            onUpdated(d.id, { status: 'Revision', clientStatus: 'Revising', needsYou: false, clientReview: 'CHANGES', clientFeedback: notes.trim() })
            setMode(null); setNotes('')
            getDeliverableActivity(d.id).then(setActivity).catch(() => { })
        } else setErr(('error' in res && res.error) || 'Không thể gửi yêu cầu.')
    }

    const done = d.clientStatus === 'Completed'

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, maxWidth: '94vw', zIndex: 81, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>{brandName}</div>
                        <h2 style={{ margin: '3px 0 0', fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>{d.title}</h2>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {/* Review link */}
                    {!d.productLink ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 14, background: 'var(--surface-2)', border: '1px dashed var(--line-2)' }}>
                            <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-3)', border: '1px solid var(--line-2)', color: 'var(--fg-3)' }}><Clock size={21} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>Not uploaded yet</div>
                                <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 2 }}>The review link will appear here once editing begins.</div>
                            </div>
                        </div>
                    ) : (
                        <a href={d.productLink} target="_blank" rel="noopener noreferrer"
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-line)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'var(--surface-2)' }}
                            style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line-2)', transition: 'border-color .15s, background .15s' }}>
                            <span style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent-fg)' }}>{done ? <FolderOpen size={22} /> : <Play size={22} style={{ marginLeft: 2 }} />}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--fg)' }}>{done ? 'View delivered files' : 'Open the cut'}</div>
                                <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 2 }}>{done ? 'Final masters & exports' : 'Watch, review and leave comments'}{d.duration ? <> · <span className="num">{d.duration}</span></> : null}</div>
                            </div>
                            <ExternalLink size={18} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                        </a>
                    )}

                    {/* Frame review login */}
                    {(d.frameUsername || d.framePassword) && (
                        <div>
                            <button onClick={() => setShowCreds(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 12.5, fontWeight: 600, padding: 0 }}>
                                <KeyRound size={13} /> {showCreds ? 'Hide review login' : 'Need a login to review?'}
                            </button>
                            {showCreds && (
                                <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)', fontSize: 12.5, color: 'var(--fg-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {d.frameUsername && <div><span style={{ color: 'var(--fg-3)' }}>User:</span> <span className="num" style={{ color: 'var(--fg-1)' }}>{d.frameUsername}</span></div>}
                                    {d.framePassword && <div><span style={{ color: 'var(--fg-3)' }}>Pass:</span> <span className="num" style={{ color: 'var(--fg-1)' }}>{d.framePassword}</span></div>}
                                    {d.frameNote && <div style={{ color: 'var(--fg-3)', fontSize: 11.5, marginTop: 2 }}>{d.frameNote}</div>}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pipeline */}
                    <div style={{ padding: '4px 4px 0' }}><PipelineTracker status={d.clientStatus} /></div>

                    {/* Your previous change request */}
                    {d.clientReview === 'CHANGES' && d.clientFeedback && (
                        <div className="pc-card" style={{ padding: 14, background: 'var(--surface-2)', borderColor: 'var(--revise-line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <RotateCcw size={14} style={{ color: 'var(--revise)' }} />
                                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--fg)' }}>Your change request</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{d.clientFeedback}</p>
                        </div>
                    )}

                    {err && <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{err}</p>}

                    {/* Contextual action */}
                    {d.needsYou && mode === null && (
                        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)', borderColor: 'var(--accent-line)' }}>
                            <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>This cut is ready for your review.</p>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className="pc-btn pc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={approve}><Check size={16} /> Approve</button>
                                <button className="pc-btn pc-btn-ghost" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={() => setMode('changes')}><RotateCcw size={15} /> Request changes</button>
                            </div>
                        </div>
                    )}
                    {d.needsYou && mode === 'changes' && (
                        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)' }}>
                            <p style={{ margin: '0 0 9px', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>What would you like changed?</p>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoFocus placeholder="e.g. Tighten the intro, swap the music in the second half…" className="pc-input" style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
                            <div style={{ display: 'flex', gap: 10, marginTop: 11 }}>
                                <button className="pc-btn pc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !notes.trim()} onClick={requestChanges}>Send to team</button>
                                <button className="pc-btn pc-btn-quiet" disabled={busy} onClick={() => { setMode(null); setNotes('') }}>Cancel</button>
                            </div>
                        </div>
                    )}
                    {done && (
                        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)', borderColor: 'var(--ok-line)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
                                <CheckCircle2 size={17} style={{ color: 'var(--ok)' }} />
                                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>Approved &amp; delivered{d.clientReviewedAt ? ' · ' + fmtDate(d.clientReviewedAt, false) : ''}</span>
                            </div>
                            {d.productLink && <a href={d.productLink} target="_blank" rel="noopener noreferrer" className="pc-btn pc-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}><Download size={15} /> Download files</a>}
                        </div>
                    )}
                    {!d.needsYou && !done && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line)' }}>
                            <Info size={16} style={{ color: 'var(--fg-3)', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>We&apos;re on it — you&apos;ll get a notification the moment this is ready for your review.</span>
                        </div>
                    )}

                    {/* Rating (completed only) */}
                    {done && <CalmRating taskId={d.id} existing={d.rating} onRated={(r) => onUpdated(d.id, { rating: r })} />}

                    {/* Details */}
                    <div>
                        <p className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>Details</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                            <DetailItem label="Format" value={d.type} />
                            <DetailItem label="Runtime" value={d.duration || '—'} />
                            <DetailItem label={done ? 'Delivered' : 'Target date'} value={fmtDate(done ? d.clientReviewedAt : d.deadline)} valueColor={rel && rel.urgent ? 'var(--attn)' : undefined} />
                            <DetailItem label="Channel" value={brandName} />
                        </div>
                    </div>

                    {/* Activity */}
                    {activity.length > 0 && (
                        <div>
                            <p className="eyebrow" style={{ fontSize: 10, marginBottom: 12 }}>Activity</p>
                            <div>
                                {activity.map((h, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <span style={{ width: 9, height: 9, borderRadius: '50%', marginTop: 4, background: i === 0 ? 'var(--accent)' : 'var(--fg-4)', flexShrink: 0 }} />
                                            {i < activity.length - 1 && <span style={{ flex: 1, width: 1.5, background: 'var(--line-2)', margin: '3px 0' }} />}
                                        </div>
                                        <div style={{ paddingBottom: i < activity.length - 1 ? 16 : 0 }}>
                                            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--fg-1)', lineHeight: 1.4 }}>{h.label}</div>
                                            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2 }}>{h.who} · {fmtDate(h.date, false)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    )
}

function DetailItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <div>
            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: valueColor || 'var(--fg-1)' }}>{value}</div>
        </div>
    )
}

/* Compact calm rating (3 dimensions) — reuses submitTaskRating. */
function CalmRating({ taskId, existing, onRated }: { taskId: string; existing: Deliverable['rating']; onRated: (r: any) => void }) {
    const [cq, setCq] = useState(0)
    const [rs, setRs] = useState(0)
    const [cm, setCm] = useState(0)
    const [fb, setFb] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    if (existing) {
        const avg = ((existing.creativeQuality + existing.responsiveness + existing.communication) / 3)
        return (
            <div className="pc-card" style={{ padding: 14, background: 'var(--surface-2)', borderColor: 'var(--ok-line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Star size={15} style={{ color: '#FBBF24', fill: '#FBBF24' }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>Thanks for your rating — {avg.toFixed(1)}/5</span>
                </div>
            </div>
        )
    }

    const submit = async () => {
        if (!cq || !rs || !cm) return
        setBusy(true); setErr(null)
        const res = await submitTaskRating(taskId, cq, rs, cm, fb.trim() || undefined)
        setBusy(false)
        if (res.success) onRated({ creativeQuality: cq, responsiveness: rs, communication: cm, qualitativeFeedback: fb.trim() || null })
        else setErr(res.error || 'Không thể lưu đánh giá.')
    }

    return (
        <div className="pc-card" style={{ padding: 16, background: 'var(--surface-2)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>How did we do?</p>
            <Stars label="Creative quality" value={cq} onChange={setCq} />
            <Stars label="Responsiveness" value={rs} onChange={setRs} />
            <Stars label="Communication" value={cm} onChange={setCm} />
            <textarea value={fb} onChange={e => setFb(e.target.value)} rows={2} placeholder="Anything to add? (optional)" className="pc-input" style={{ height: 'auto', padding: '9px 11px', resize: 'vertical', lineHeight: 1.5, marginTop: 6 }} />
            {err && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{err}</p>}
            <button className="pc-btn pc-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 11 }} disabled={busy || !cq || !rs || !cm} onClick={submit}>Submit rating</button>
        </div>
    )
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{label}</span>
            <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, lineHeight: 0 }}>
                        <Star size={17} style={{ color: n <= value ? '#FBBF24' : 'var(--fg-4)', fill: n <= value ? '#FBBF24' : 'transparent' }} />
                    </button>
                ))}
            </div>
        </div>
    )
}
