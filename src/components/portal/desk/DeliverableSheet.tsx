'use client'

/* THE DESK — deliverable detail slide-over. Credential-agnostic: every server
   call goes through the injected DeliverableActions adapter (token-bound).
   Mirrors the calm DeliverableDetailPanel behaviour exactly — approve /
   request-changes optimistic patches, review link, frame creds, rating,
   comments, activity — restyled for Editorial Atelier. */

import { useEffect, useRef, useState } from 'react'
import {
    Play, FolderOpen, ExternalLink, Clock, Check, RotateCcw, Info, CheckCircle2,
    Download, KeyRound, Star, History, ChevronDown, Send,
} from 'lucide-react'
import { Sheet, SheetHeader, Button, Avatar } from './ui'
import { StatusPill } from './ui'
import { deskStatus, statusSentence } from './status'
import { fmtDate, relDeadline, fmtMoney } from '../calm/format'
import type { Deliverable, ActivityItem, DeliverableActions } from '../calm/types'

// [AUDIT HT-031] Defense-in-depth on render: never emit a non-http(s) href.
function safeHref(raw: string | null | undefined): string {
    const s = (raw || '').trim()
    if (/^https?:\/\//i.test(s)) return s
    if (/^[a-z][a-z0-9+.\-]*:/i.test(s)) return '#'
    return s ? `https://${s}` : '#'
}

export default function DeliverableSheet({ d, actions, onClose, onUpdated, onOpenReview }: {
    d: Deliverable
    actions: DeliverableActions
    onClose: () => void
    onUpdated: (id: string, patch: Partial<Deliverable>) => void
    /** Open the in-portal screening room for a same-origin /r review link. */
    onOpenReview?: (url: string, title: string) => void
}) {
    const [mode, setMode] = useState<null | 'changes'>(null)
    const [notes, setNotes] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [activity, setActivity] = useState<ActivityItem[]>([])
    const [showCreds, setShowCreds] = useState(false)
    const [showActivity, setShowActivity] = useState(false)

    const brandName = d.client?.name || '—'
    /* [Tombstone] A cancelled production comes back to the portal as clientStatus 'Closed'
       instead of vanishing retroactively. Every line below that describes work IN FLIGHT
       has to be suppressed for it: cancelling deliberately keeps the old deadline on the
       row, and this sheet's copy was written for live jobs. Unguarded, a closed job showed
       an overdue date, "Your changes are being made", and "We're on it — you'll get a note
       the moment this is ready", i.e. it told the client a cancelled video was being edited.
       That is the same phantom-work failure the readmission was supposed to end. */
    const closed = d.clientStatus === 'Closed'
    const rel = d.clientStatus === 'Completed' || closed ? null : relDeadline(d.deadline)
    const done = d.clientStatus === 'Completed'

    useEffect(() => {
        let alive = true
        actions.activity(d.id).then(rows => { if (alive) setActivity(rows) }).catch(() => {})
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [d.id])

    const approve = async () => {
        setBusy(true); setErr(null)
        const res = await actions.approve(d.id)
        setBusy(false)
        if ('success' in res && res.success) {
            onUpdated(d.id, { status: 'Hoàn tất', clientStatus: 'Completed', needsYou: false, clientReview: 'APPROVED' })
            actions.activity(d.id).then(setActivity).catch(() => {})
        } else setErr(('error' in res && res.error) || 'Could not approve. Please try again.')
    }

    const requestChanges = async () => {
        if (!notes.trim()) return
        setBusy(true); setErr(null)
        const res = await actions.requestChanges(d.id, notes.trim())
        setBusy(false)
        if ('success' in res && res.success) {
            onUpdated(d.id, { status: 'Revision', clientStatus: 'In revision', needsYou: false, clientReview: 'CHANGES', clientFeedback: notes.trim() })
            setMode(null); setNotes('')
            actions.activity(d.id).then(setActivity).catch(() => {})
        } else setErr(('error' in res && res.error) || 'Could not send your request. Please try again.')
    }

    return (
        <Sheet onClose={onClose} width={520} label={d.title}>
            <SheetHeader kicker={brandName} title={d.title} onClose={onClose} right={<StatusPill status={d.clientStatus} style={{ marginTop: 4 }} />} />

            <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 22 }}>
                {d.jobPriceUSD != null && Number(d.jobPriceUSD) > 0 && (
                    <div className="desk-num" style={{ fontSize: '1.5rem', color: 'var(--ink)', lineHeight: 1 }}>
                        {fmtMoney(d.jobPriceUSD)}
                        <span className="kicker" style={{ marginLeft: 10 }}>price for this video</span>
                    </div>
                )}

                {/* Review board link */}
                {!(d.reviewUrl || d.productLink) ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 16, borderRadius: 8, background: 'var(--paper-sunken)', border: '1px dashed var(--hairline-strong)' }}>
                        <span style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--paper-raised)', border: '1px solid var(--hairline)', color: 'var(--ink-3)' }}><Clock size={20} /></span>
                        {/* [Client escalation 2026-07] A task that HAS client feedback on record is
                            not un-started — the editor is working the revision, and the screening
                            link is intentionally dark until an admin re-approves the new cut. Saying
                            "Not uploaded yet" there told the client their delivered revision had
                            vanished, which is exactly what they reported as work "going missing". */}
                        {/* A closed job is checked FIRST: it can carry clientFeedback from before it
                            was cancelled, which would otherwise promise a revision that will never
                            arrive. */}
                        <div style={{ minWidth: 0 }}>
                            <div className="desk-serif" style={{ fontSize: '1rem', color: 'var(--ink)' }}>
                                {closed ? 'This project was closed' : d.clientFeedback ? 'Your changes are being made' : 'Not uploaded yet'}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-3)', marginTop: 2 }}>
                                {closed
                                    ? 'It is kept here for your records. Nothing further is in progress — message us if that looks wrong.'
                                    : d.clientFeedback
                                        ? 'The new video appears here as soon as it clears our check.'
                                        : 'The screening link appears here once editing begins.'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <a href={safeHref(d.reviewUrl || d.productLink)} target="_blank" rel="noopener noreferrer"
                        onClick={e => {
                            // Same-origin /r review link → open the in-portal screening room (unless
                            // the client cmd/ctrl/middle-clicks to open a real new tab). External
                            // productLink (frame.io etc.) always opens in a new tab.
                            if (d.reviewUrl && onOpenReview && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                                e.preventDefault()
                                onOpenReview(d.reviewUrl, d.title)
                            }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, borderRadius: 8, background: 'var(--paper-raised)', border: '1px solid var(--hairline)', textDecoration: 'none', transition: 'border-color .15s, background .15s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-line)'; e.currentTarget.style.background = 'var(--accent-tint)' }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hairline)'; e.currentTarget.style.background = 'var(--paper-raised)' }}>
                        <span style={{ width: 44, height: 44, borderRadius: 8, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-tint)', border: '1px solid var(--accent-line)', color: 'var(--accent)' }}>{done ? <FolderOpen size={21} /> : <Play size={21} style={{ marginLeft: 2 }} />}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="desk-serif" style={{ fontSize: '1.02rem', color: 'var(--ink)' }}>{done ? 'View delivered files' : 'Open the screening room'}</div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--ink-3)', marginTop: 2 }}>{done ? 'Final masters & exports' : 'Watch, comment and approve'}{d.duration ? <> · <span className="desk-mono">{d.duration}</span></> : null}</div>
                        </div>
                        <ExternalLink size={17} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                    </a>
                )}

                {/* Frame review login */}
                {(d.frameUsername || d.framePassword) && (
                    <div>
                        <button onClick={() => setShowCreds(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>
                            <KeyRound size={13} /> {showCreds ? 'Hide review login' : 'Need a login to review?'}
                        </button>
                        {showCreds && (
                            <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 6, background: 'var(--paper-sunken)', border: '1px solid var(--hairline)', fontSize: '0.82rem', color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {d.frameUsername && <div><span className="desk-muted">User:</span> <span className="desk-mono">{d.frameUsername}</span></div>}
                                {d.framePassword && <div><span className="desk-muted">Pass:</span> <span className="desk-mono">{d.framePassword}</span></div>}
                                {d.frameNote && <div className="desk-muted" style={{ fontSize: '0.76rem', marginTop: 2 }}>{d.frameNote}</div>}
                            </div>
                        )}
                    </div>
                )}

                {/* Status sentence */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 7, flexShrink: 0, background: 'var(--accent)' }} />
                    <span style={{ fontSize: '0.9rem', color: 'var(--ink-2)', lineHeight: 1.45 }}>{statusSentence(d.clientStatus)}</span>
                </div>

                {/* Prior change request */}
                {d.clientReview === 'CHANGES' && d.clientFeedback && (
                    <div style={{ padding: 14, borderRadius: 6, background: 'var(--umber-tint)', border: '1px solid color-mix(in srgb, var(--umber) 30%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <RotateCcw size={14} style={{ color: 'var(--umber)' }} />
                            <span className="kicker">Your change request</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{d.clientFeedback}</p>
                    </div>
                )}

                {err && <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--brick)' }}>{err}</p>}

                {/* Contextual action */}
                {d.needsYou && mode === null && (
                    <div style={{ padding: 16, borderRadius: 8, background: 'var(--accent-tint)', border: '1px solid var(--accent-line)' }}>
                        <p className="desk-serif" style={{ margin: '0 0 12px', fontSize: '1.02rem', color: 'var(--ink)' }}>This video is ready for your review.</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <Button variant="primary" full disabled={busy} onClick={approve}><Check size={16} /> Approve</Button>
                            <Button variant="quiet" full disabled={busy} onClick={() => setMode('changes')}><RotateCcw size={15} /> Request changes</Button>
                        </div>
                    </div>
                )}
                {d.needsYou && mode === 'changes' && (
                    <div style={{ padding: 16, borderRadius: 8, background: 'var(--paper-raised)', border: '1px solid var(--hairline)' }}>
                        <p className="desk-serif" style={{ margin: '0 0 9px', fontSize: '1rem', color: 'var(--ink)' }}>What would you like changed?</p>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} autoFocus placeholder="e.g. Tighten the intro, swap the music in the second half…" className="desk-input" />
                        <div style={{ display: 'flex', gap: 10, marginTop: 11 }}>
                            <Button variant="primary" full disabled={busy || !notes.trim()} onClick={requestChanges}>Send to the studio</Button>
                            <Button variant="quiet" disabled={busy} onClick={() => { setMode(null); setNotes('') }}>Cancel</Button>
                        </div>
                    </div>
                )}
                {done && (
                    <div style={{ padding: 16, borderRadius: 8, background: 'var(--sage-tint)', border: '1px solid color-mix(in srgb, var(--sage) 30%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: d.productLink ? 13 : 0 }}>
                            <CheckCircle2 size={17} style={{ color: 'var(--sage)' }} />
                            <span className="desk-serif" style={{ fontSize: '1rem', color: 'var(--ink)' }}>Approved &amp; delivered{d.clientReviewedAt ? ' · ' + fmtDate(d.clientReviewedAt, false) : ''}</span>
                        </div>
                        {d.productLink && <a href={safeHref(d.productLink)} target="_blank" rel="noopener noreferrer" className="desk-btn desk-btn--quiet" style={{ width: '100%' }}><Download size={15} /> Download files</a>}
                    </div>
                )}
                {/* needsYou is forced false for a closed job, so without the !closed guard this
                    reassurance ("we're on it") is exactly what a cancelled production renders. */}
                {!d.needsYou && !done && !closed && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderRadius: 6, background: 'var(--paper-sunken)', border: '1px solid var(--hairline)' }}>
                        <Info size={16} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>We&apos;re on it — you&apos;ll get a note the moment this is ready for your review.</span>
                    </div>
                )}

                {done && <DeskRating taskId={d.id} actions={actions} existing={d.rating} onRated={(r) => onUpdated(d.id, { rating: r })} />}

                {/* Details */}
                <div>
                    <p className="kicker" style={{ marginBottom: 12 }}>Details</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px' }}>
                        <DetailItem label="Format" value={d.type} />
                        <DetailItem label="Runtime" value={d.duration || '—'} />
                        {/* "Target date" on a closed job reads as a live commitment. */}
                        <DetailItem label={closed ? 'Was due' : done ? 'Delivered' : 'Target date'} value={fmtDate(done ? d.clientReviewedAt : d.deadline)} valueColor={rel && rel.urgent ? 'var(--brick)' : undefined} />
                        <DetailItem label="Channel" value={brandName} />
                        {d.manager && <DetailItem label="Managed by" value={d.manager} />}
                    </div>
                </div>

                {/* Comments */}
                <DeskComments taskId={d.id} actions={actions} closed={closed} />

                {/* Activity */}
                {activity.length > 0 && (
                    <div>
                        <button onClick={() => setShowActivity(s => !s)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.82rem', fontWeight: 600, padding: 0 }}>
                            <History size={13} /> {showActivity ? 'Hide history' : 'Show history'}
                            <ChevronDown size={13} style={{ transition: 'transform .2s var(--ease)', transform: showActivity ? 'rotate(180deg)' : 'none' }} />
                        </button>
                        {showActivity && (
                            <div style={{ marginTop: 14 }}>
                                {activity.map((h, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, background: i === 0 ? 'var(--accent)' : 'var(--hairline-strong)', flexShrink: 0 }} />
                                            {i < activity.length - 1 && <span style={{ flex: 1, width: 1.5, background: 'var(--hairline)', margin: '3px 0' }} />}
                                        </div>
                                        <div style={{ paddingBottom: i < activity.length - 1 ? 16 : 0 }}>
                                            <div style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.4 }}>{h.label}</div>
                                            <div className="desk-mono" style={{ fontSize: '0.66rem', color: 'var(--ink-3)', marginTop: 3, letterSpacing: '0.04em' }}>{h.who} · {fmtDate(h.date, false)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </Sheet>
    )
}

function DetailItem({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
    return (
        <div>
            <div className="kicker" style={{ marginBottom: 4, fontSize: '0.62rem' }}>{label}</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 500, color: valueColor || 'var(--ink)' }}>{value}</div>
        </div>
    )
}

/* ── Rating (3 dimensions) ───────────────────────────────────────────────── */
function DeskRating({ taskId, actions, existing, onRated }: { taskId: string; actions: DeliverableActions; existing: Deliverable['rating']; onRated: (r: any) => void }) {
    const [cq, setCq] = useState(0)
    const [rs, setRs] = useState(0)
    const [cm, setCm] = useState(0)
    const [fb, setFb] = useState('')
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)

    if (existing) {
        const avg = (existing.creativeQuality + existing.responsiveness + existing.communication) / 3
        return (
            <div style={{ padding: 14, borderRadius: 6, background: 'var(--sage-tint)', border: '1px solid color-mix(in srgb, var(--sage) 28%, transparent)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star size={15} style={{ color: 'var(--ochre)', fill: 'var(--ochre)' }} />
                <span style={{ fontSize: '0.88rem', color: 'var(--ink)' }}>Thanks for your rating — {avg.toFixed(1)}/5</span>
            </div>
        )
    }

    const submit = async () => {
        if (!cq || !rs || !cm) return
        setBusy(true); setErr(null)
        const res = await actions.rate(taskId, cq, rs, cm, fb.trim() || undefined)
        setBusy(false)
        if (res.success) onRated({ creativeQuality: cq, responsiveness: rs, communication: cm, qualitativeFeedback: fb.trim() || null })
        else setErr(res.error || 'Could not save your rating. Please try again.')
    }

    return (
        <div style={{ padding: 16, borderRadius: 8, background: 'var(--paper-raised)', border: '1px solid var(--hairline)' }}>
            <p className="desk-serif" style={{ margin: '0 0 12px', fontSize: '1rem', color: 'var(--ink)' }}>How did we do?</p>
            <Stars label="Creative quality" value={cq} onChange={setCq} />
            <Stars label="Responsiveness" value={rs} onChange={setRs} />
            <Stars label="Communication" value={cm} onChange={setCm} />
            <textarea value={fb} onChange={e => setFb(e.target.value)} rows={2} placeholder="Anything to add? (optional)" className="desk-input" style={{ marginTop: 8 }} />
            {err && <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: 'var(--brick)' }}>{err}</p>}
            <Button variant="primary" full disabled={busy || !cq || !rs || !cm} onClick={submit} style={{ marginTop: 11 }}>Submit rating</Button>
        </div>
    )
}

function Stars({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--ink-2)' }}>{label}</span>
            <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1, lineHeight: 0 }}>
                        <Star size={17} style={{ color: n <= value ? 'var(--ochre)' : 'var(--hairline-strong)', fill: n <= value ? 'var(--ochre)' : 'transparent' }} />
                    </button>
                ))}
            </div>
        </div>
    )
}

/* ── Comments (CLIENT-visibility, token-scoped) ──────────────────────────── */
type Feed = Awaited<ReturnType<NonNullable<DeliverableActions['getCommentFeed']>>>
function DeskComments({ taskId, actions, closed }: { taskId: string; actions: DeliverableActions; closed?: boolean }) {
    const [feed, setFeed] = useState<Feed>([])
    const [body, setBody] = useState('')
    const [busy, setBusy] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const scrollRef = useRef<HTMLDivElement | null>(null)

    const load = () => {
        if (!actions.getCommentFeed) { setLoaded(true); return }
        actions.getCommentFeed(taskId).then(rows => { setFeed(rows); setLoaded(true) }).catch(() => setLoaded(true))
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [taskId])

    if (!actions.getCommentFeed || !actions.postComment) return null

    const send = async () => {
        const text = body.trim()
        if (!text || busy) return
        setBusy(true)
        const res = await actions.postComment!(taskId, text)
        setBusy(false)
        if (res && (res as any).success !== false) { setBody(''); load() }
    }

    return (
        <div>
            <p className="kicker" style={{ marginBottom: 12 }}>Messages</p>
            <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 12 }}>
                {/* A closed job's feed always comes back empty — every read routes through
                    findScopedTask, which refuses archived rows. "No messages yet" would then
                    claim a conversation the client remembers having never happened. */}
                {loaded && feed.length === 0 && (
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-3)' }}>
                        {closed
                            ? 'Messages on a closed project aren’t shown here. Ask us and we’ll dig them out.'
                            : 'No messages yet — say hello to the studio.'}
                    </p>
                )}
                {feed.map(item => item.kind === 'event' ? (
                    <div key={item.id} className="desk-mono" style={{ fontSize: '0.66rem', letterSpacing: '0.04em', color: 'var(--ink-3)', textAlign: 'center' }}>
                        {item.label}
                    </div>
                ) : (
                    <div key={item.id} style={{ display: 'flex', gap: 10, flexDirection: item.isMine ? 'row-reverse' : 'row' }}>
                        <Avatar name={item.authorName} size={28} />
                        <div style={{ maxWidth: '78%' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: item.isMine ? 'flex-end' : 'flex-start', marginBottom: 3 }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-2)' }}>{item.isMine ? 'You' : item.authorName}</span>
                                <span className="desk-mono" style={{ fontSize: '0.6rem', color: 'var(--ink-3)' }}>{fmtDate(item.createdAt, false)}</span>
                            </div>
                            <div style={{
                                padding: '9px 12px', borderRadius: 8, fontSize: '0.88rem', lineHeight: 1.45, whiteSpace: 'pre-wrap',
                                background: item.isMine ? 'var(--accent-tint)' : 'var(--paper-raised)',
                                border: '1px solid ' + (item.isMine ? 'var(--accent-line)' : 'var(--hairline)'),
                                color: 'var(--ink)',
                            }}>{item.body}</div>
                        </div>
                    </div>
                ))}
            </div>
            {/* postComment routes through findScopedTask too, so on a closed job Send is a
                button that silently does nothing. Say the thread is shut rather than let the
                client type a message that quietly evaporates. */}
            {closed ? (
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-3)' }}>This thread is closed. Reply to your last email and we&apos;ll pick it up there.</p>
            ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={1} placeholder="Message the studio…" className="desk-input"
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                        style={{ minHeight: 40, maxHeight: 120 }} />
                    <Button variant="primary" disabled={busy || !body.trim()} onClick={send} aria-label="Send"><Send size={15} /></Button>
                </div>
            )}
        </div>
    )
}
