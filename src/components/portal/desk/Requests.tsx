'use client'

/* THE DESK — Your requests (Correspondence). The client's own asks to the studio,
   read back with the studio's decision: a note on decline, a linked production on
   accept. Token-scoped read (getRequests); front-door + how-it-works when empty. */

import { useEffect, useState } from 'react'
import { Send, Loader, ChevronDown, ArrowUpRight, RotateCcw, Check } from 'lucide-react'
import { Kicker, Button } from './ui'
import { fmtDate } from '../calm/format'
import type { DeliverableActions, ClientRequestPortalDTO } from '../calm/types'

const TONE: Record<ClientRequestPortalDTO['status'], string> = {
    pending: 'var(--stone)',
    reviewing: 'var(--ochre)',
    accepted: 'var(--sage)',
    declined: 'var(--brick)',
}

export default function Requests({ actions, onNew, openDeliverable }: {
    actions: DeliverableActions
    onNew?: () => void
    openDeliverable: (id: string) => void
}) {
    const [rows, setRows] = useState<ClientRequestPortalDTO[] | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let alive = true
        if (!actions.getRequests) { setLoading(false); return }
        actions.getRequests().then(r => { if (alive) { setRows(r); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
        return () => { alive = false }
        // eslint-disable-next-line
    }, [])

    const has = rows && rows.length > 0

    return (
        <main style={{ padding: '26px 30px', maxWidth: 900, minHeight: 'calc(100vh - 58px)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: 0 }}>Your requests</h1>
                {onNew && <span style={{ marginLeft: 'auto' }}><Button variant="secondary" size="sm" onClick={onNew}>New request</Button></span>}
            </div>
            <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', margin: '0 0 24px' }}>Every request is acknowledged, reviewed and answered — in writing, right here.</p>

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
                    <Loader size={16} className="desk-spin" /> <span style={{ fontSize: '0.86rem' }}>Loading your requests…</span>
                </div>
            ) : has ? (
                <>
                    <div style={{ display: 'grid', gap: 12 }}>
                        {rows!.map(r => <RequestRow key={r.id} r={r} openDeliverable={openDeliverable} />)}
                    </div>
                    <div style={{ height: 40 }} />
                </>
            ) : (
                <EmptyFrontDoor onNew={onNew} />
            )}
        </main>
    )
}

function RequestRow({ r, openDeliverable }: { r: ClientRequestPortalDTO; openDeliverable: (id: string) => void }) {
    const [open, setOpen] = useState(false)
    const tone = TONE[r.status]
    const links: [string, string | null][] = [
        ['Raw footage', r.rawFootage], ['Collect files', r.collectFile], ['B-roll', r.bRoll],
        ['References', r.refs], ['Submission folder', r.submitFolder], ['Script', r.script],
    ]
    const hasDetail = !!(r.videoList || r.notes || links.some(([, v]) => v) || r.desiredType || r.desiredDeadline)

    return (
        <div style={{ background: 'var(--paper-raised)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${tone}`, borderRadius: 4 }}>
            <div style={{ padding: '15px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <p className="desk-serif" style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{r.title}</p>
                        <span className="desk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6rem', letterSpacing: '0.08em', color: tone, textTransform: 'uppercase' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{r.statusLabel}
                        </span>
                    </span>
                    <p className="desk-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.06em', color: 'var(--ink-3)', margin: '5px 0 0', textTransform: 'uppercase' }}>
                        {['SENT ' + fmtDate(r.submittedAt, false), r.brandName, r.periodName].filter(Boolean).join(' · ')}
                    </p>
                </span>
                {hasDetail && (
                    <button onClick={() => setOpen(o => !o)} className="desk-iconbtn" style={{ width: 30, height: 30, marginTop: -3 }} aria-label={open ? 'Collapse' : 'Expand'}>
                        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </button>
                )}
            </div>

            {/* Studio reply — only present once a decision exists */}
            {r.status === 'declined' && r.studioReply && (
                <div style={{ margin: '0 18px 15px', padding: '10px 14px', borderRadius: 6, background: 'var(--brick-tint)', border: '1px solid color-mix(in srgb, var(--brick) 26%, transparent)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <RotateCcw size={13} style={{ color: 'var(--brick)' }} />
                        <span className="kicker">The studio replied{r.reviewedAt ? ' · ' + fmtDate(r.reviewedAt, false) : ''}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{r.studioReply}</p>
                </div>
            )}
            {r.status === 'accepted' && r.linkedTaskId && (
                <div style={{ margin: '0 18px 15px' }}>
                    <button onClick={() => openDeliverable(r.linkedTaskId!)} className="desk-btn desk-btn--quiet desk-btn--sm">
                        <Check size={14} style={{ color: 'var(--sage)' }} /> Accepted — view the production <ArrowUpRight size={13} />
                    </button>
                </div>
            )}

            {open && hasDetail && (
                <div style={{ borderTop: '1px solid var(--hairline-faint)', padding: '14px 18px', display: 'grid', gap: 12 }}>
                    {(r.desiredType || r.desiredDeadline) && (
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            {r.desiredType && <Meta label="Kind of video" value={r.desiredType} />}
                            {r.desiredDeadline && <Meta label="Ideal deadline" value={fmtDate(r.desiredDeadline)} />}
                        </div>
                    )}
                    {r.videoList && <Block label="Video list" value={r.videoList} />}
                    {r.notes && <Block label="Your brief" value={r.notes} />}
                    {links.some(([, v]) => v) && (
                        <div>
                            <Kicker style={{ marginBottom: 8 }}>Assets you sent</Kicker>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {links.filter(([, v]) => v).map(([label, v]) => (
                                    <a key={label} href={v!} target="_blank" rel="noopener noreferrer" className="desk-btn desk-btn--quiet desk-btn--sm" style={{ textDecoration: 'none' }}>
                                        {label} <ArrowUpRight size={12} />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function Meta({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="kicker" style={{ marginBottom: 3, fontSize: '0.62rem' }}>{label}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{value}</div>
        </div>
    )
}
function Block({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <Kicker style={{ marginBottom: 6 }}>{label}</Kicker>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--ink-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{value}</p>
        </div>
    )
}

function EmptyFrontDoor({ onNew }: { onNew?: () => void }) {
    return (
        <>
            <div style={{ border: '1px solid var(--hairline)', background: 'var(--paper-raised)', borderRadius: 4, padding: '40px 34px', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, margin: '0 auto 16px', borderRadius: '50%', background: 'var(--accent-tint)', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={20} style={{ color: 'var(--accent)' }} />
                </div>
                <h2 className="desk-display" style={{ fontSize: '1.2rem', margin: '0 0 8px' }}>Ask the studio for new work.</h2>
                <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', maxWidth: 460, margin: '0 auto 20px' }}>
                    Send a brief with your footage links and what you have in mind. We acknowledge it, scope it, and reply with a plan and a price — no back-and-forth email.
                </p>
                {onNew && <Button variant="primary" onClick={onNew}>Start a request</Button>}
            </div>
            <div style={{ marginTop: 26 }}>
                <Kicker style={{ marginBottom: 12 }}>How it works</Kicker>
                <div style={{ display: 'grid', gap: 1, background: 'var(--hairline-faint)', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
                    {[
                        ['01', 'You send a brief', 'Footage links, the kind of video you want, and any deadline.'],
                        ['02', 'We scope it', 'The studio confirms feasibility, timeline and price — in writing.'],
                        ['03', 'It becomes a production', 'Approved requests turn into a production you track in the index.'],
                    ].map(([n, t, d]) => (
                        <div key={n} style={{ background: 'var(--paper-raised)', padding: '15px 18px', display: 'flex', gap: 16, alignItems: 'baseline' }}>
                            <span className="desk-mono kicker__index" style={{ fontSize: '0.72rem' }}>{n}</span>
                            <span>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.92rem' }}>{t}</p>
                                <p style={{ margin: '3px 0 0', fontSize: '0.84rem', color: 'var(--ink-2)' }}>{d}</p>
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </>
    )
}
