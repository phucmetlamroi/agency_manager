'use client'

/* THE DESK — "Your desk" / Action tray. The landing room: everything that needs
   the client lands here first (cuts awaiting review, overdue statements), plus
   a month-at-a-glance ledger and the email-updates opt-in. */

import { useEffect, useState } from 'react'
import { Play, FileText, Check, ShieldCheck, X } from 'lucide-react'
import { Kicker, Button, StatusPill, useToast } from './ui'
import { fmtMoney, fmtDate, mapInvoiceStatus, relDeadline } from '../calm/format'
import type { Deliverable, Invoice, DeliverableActions } from '../calm/types'

export default function YourDesk({
    deliverables, invoices, actions, accountName, periodLabel, needsYouCount,
    openDeliverable, openReview, openFolder, goStatements, openInvoice,
}: {
    deliverables: Deliverable[]
    invoices: Invoice[]
    actions: DeliverableActions
    accountName: string
    periodLabel: string
    needsYouCount: number
    openDeliverable: (id: string) => void
    openReview: (url: string, title: string, deliverableId: string, folderId?: string | null) => void
    openFolder: (folderId: string) => void
    goStatements: () => void
    openInvoice: (id: string) => void
}) {
    const toast = useToast()
    const cuts = deliverables.filter(d => d.needsYou)
    // [Batch approval 2026-07] Clients who commission a month of reels at once had to
    // open and approve every single one. Tick the ones you're happy with, approve in a
    // single action. The server re-checks each task against the same gates as the
    // one-at-a-time approve, so this is a shortcut through CLICKS, not through review.
    const [picked, setPicked] = useState<Set<string>>(new Set())
    const [approving, setApproving] = useState(false)
    const togglePick = (id: string) =>
        setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    const allPicked = cuts.length > 0 && cuts.every(d => picked.has(d.id))
    const approvePicked = async () => {
        if (!actions.approveMany || picked.size === 0 || approving) return
        setApproving(true)
        // try/finally, because this server action CAN reject rather than resolve — a database
        // transaction timeout on a large batch throws. Without it the rejection unwound the
        // handler before setApproving(false) ran, leaving a permanently disabled "Approving…"
        // button on a batch that approved nothing, and no message either way.
        try {
            const res = await actions.approveMany(Array.from(picked))
            if (res.success) {
                toast('ok', `Approved ${res.approved} video${res.approved === 1 ? '' : 's'}.${res.skipped ? ` ${res.skipped} skipped.` : ''}`)
                setPicked(new Set())
            } else toast('err', res.error || 'Could not approve those.')
        } catch {
            toast('err', 'That took too long and nothing was approved — none of your videos changed. Try again, or approve a few at a time.')
        } finally {
            setApproving(false)
        }
    }
    const overdue = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue')
    const delivered = deliverables.filter(d => d.clientStatus === 'Completed').length
    const inProduction = deliverables.filter(d => !d.needsYou && d.clientStatus !== 'Completed' && d.clientStatus !== 'Closed').length
    const outstanding = invoices
        .filter(i => { const s = mapInvoiceStatus(i.status); return s === 'Overdue' || s === 'Due' })
        .reduce((sum, i) => sum + Number(i.totalDue || 0), 0)

    const trayEmpty = cuts.length === 0 && overdue.length === 0
    const headline = trayEmpty
        ? 'You’re all caught up.'
        : needsYouCount > 0
            ? `${needsYouCount} ${needsYouCount === 1 ? 'video is' : 'videos are'} waiting on you.`
            : 'A couple of things need a look.'

    return (
        <div className="desk-tray-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px' }}>
            <main className="desk-tray-main" style={{ padding: '30px 34px', borderRight: '1px solid var(--hairline)', minHeight: 'calc(100vh - 58px)' }}>
                <Kicker accent style={{ marginBottom: 10 }}>Action tray · {periodLabel}</Kicker>
                <h1 className="desk-display" style={{ fontSize: '1.95rem', margin: '0 0 6px' }}>{headline}</h1>
                <p style={{ fontSize: '0.92rem', color: 'var(--ink-2)', margin: '0 0 24px' }}>Clear the tray and you’re done — anything new lands here first.</p>

                {/* Batch bar — only when there is more than one cut to decide on. A single
                    waiting video doesn't need a selection model. */}
                {actions.approveMany && cuts.length > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
                        <button
                            onClick={() => setPicked(allPicked ? new Set() : new Set(cuts.map(d => d.id)))}
                            className="desk-mono"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.66rem', letterSpacing: '0.06em', padding: 0 }}
                        >
                            {allPicked ? 'CLEAR SELECTION' : `SELECT ALL ${cuts.length}`}
                        </button>
                        {picked.size > 0 && (
                            <Button variant="primary" size="sm" onClick={approvePicked} disabled={approving}>
                                {approving ? 'Approving…' : `Approve ${picked.size} video${picked.size === 1 ? '' : 's'}`}
                            </Button>
                        )}
                    </div>
                )}

                <div style={{ display: 'grid', gap: 12 }}>
                    {cuts.map(d => {
                        const rel = relDeadline(d.deadline)
                        const on = picked.has(d.id)
                        /* [Báo cáo chủ sản phẩm 2026-08-02] "khi mà bấm vào watch and decide thì
                           nó sẽ chỉ hiện ra đúng một video thôi… đáng lẽ nó cũng sẽ phải nhảy trực
                           tiếp tới cái folder".
                           Một dòng ở đây = một TASK. Task nhiều-hook có N video nhưng `reviewUrl`
                           chỉ trỏ tới MỘT bảng duyệt, nên bấm vào là khách chỉ thấy một cái và
                           không biết còn ba cái nữa. Nhiều hơn một thì mở THƯ MỤC; đúng một thì
                           vào thẳng phòng chiếu như cũ — bắt khách đi qua trình duyệt file để xem
                           một video duy nhất là thêm bước vô ích. */
                        const many = (d.reviewCount ?? 0) > 1 && !!d.reviewFolderId
                        const openCut = () => {
                            if (many) return openFolder(d.reviewFolderId!)
                            if (d.reviewUrl) return openReview(d.reviewUrl, d.title, d.id, d.reviewFolderId ?? null)
                            return openDeliverable(d.id)
                        }
                        return (
                            <div key={d.id} className="desk-tray-card" style={{ display: 'flex', gap: 18, alignItems: 'center', background: on ? 'var(--accent-tint)' : 'var(--paper-raised)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--hairline)'), borderLeft: '3px solid var(--accent)', padding: '16px 20px', borderRadius: 4 }}>
                                {actions.approveMany && cuts.length > 1 && (
                                    <input
                                        type="checkbox"
                                        checked={on}
                                        onChange={() => togglePick(d.id)}
                                        aria-label={`Select ${d.title} for approval`}
                                        style={{ flex: 'none', width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                                    />
                                )}
                                <button onClick={openCut} className="desk-tray-thumb" style={{ position: 'relative', width: 132, height: 76, background: '#09090b', borderRadius: 3, overflow: 'hidden', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none' }}>
                                    <Play size={18} fill="#f7f2e9" color="#f7f2e9" />
                                    {d.duration && <span className="desk-mono" style={{ position: 'absolute', right: 6, bottom: 5, fontSize: '0.56rem', color: '#eae5d9', background: 'rgba(9,9,11,.65)', padding: '1px 5px' }}>{d.duration}</span>}
                                </button>
                                <span style={{ minWidth: 0, flex: 1 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                        <p className="desk-serif" style={{ margin: 0, fontWeight: 600, fontSize: '1.02rem' }}>{d.title}</p>
                                        <StatusPill status={d.clientStatus} />
                                    </span>
                                    <p className="desk-mono" style={{ fontSize: '0.64rem', letterSpacing: '0.08em', color: 'var(--ink-3)', margin: '5px 0 0', textTransform: 'uppercase' }}>
                                        {(d.client?.name || 'Production')}{d.deadline ? ` · ${rel.text || 'Target ' + fmtDate(d.deadline, false)}` : ''}
                                    </p>
                                    <p style={{ fontSize: '0.84rem', color: 'var(--ink-2)', margin: '6px 0 0' }}>
                                        {many
                                            ? `${d.reviewCount} videos are ready for your review.`
                                            : 'A new video is ready for your review.'}
                                    </p>
                                </span>
                                <Button variant="primary" size="sm" className="desk-tray-cta" onClick={openCut} style={{ flex: 'none' }}>
                                    {many ? <>Open {d.reviewCount} videos</> : <>Watch &amp; decide</>}
                                </Button>
                            </div>
                        )
                    })}

                    {overdue.map(i => (
                        <div key={i.id} style={{ display: 'flex', gap: 18, alignItems: 'center', background: 'var(--paper-raised)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--brick)', padding: '16px 20px', borderRadius: 4 }}>
                            <span style={{ width: 132, height: 76, background: 'var(--paper-sunken)', border: '1px solid var(--hairline)', borderRadius: 3, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <FileText size={18} color="var(--brick)" />
                                <span className="desk-mono" style={{ fontSize: '0.56rem', letterSpacing: '0.1em', color: 'var(--brick)' }}>OVERDUE</span>
                            </span>
                            <span style={{ minWidth: 0, flex: 1 }}>
                                <p className="desk-serif" style={{ margin: 0, fontWeight: 600, fontSize: '1.02rem' }}>Statement {i.invoiceNumber} — <span className="desk-num">{fmtMoney(i.totalDue)}</span></p>
                                <p className="desk-mono" style={{ fontSize: '0.64rem', letterSpacing: '0.08em', color: 'var(--ink-3)', margin: '5px 0 0', textTransform: 'uppercase' }}>
                                    ISSUED {fmtDate(i.issueDate, false)}{i.dueDate ? ` · DUE ${fmtDate(i.dueDate, false)}` : ''}
                                </p>
                                <p style={{ fontSize: '0.84rem', color: 'var(--ink-2)', margin: '6px 0 0' }}>The payment reference is one click away.</p>
                            </span>
                            <Button variant="secondary" size="sm" onClick={() => openInvoice(i.id)} style={{ flex: 'none' }}>Open statement</Button>
                        </div>
                    ))}
                </div>

                {trayEmpty && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginTop: 30, color: 'var(--ink-3)' }}>
                        <ShieldCheck size={15} style={{ color: 'var(--sage)' }} />
                        <span style={{ fontSize: '0.84rem' }}>Every video is decided — the tray clears itself as you act.</span>
                    </div>
                )}
            </main>

            <aside className="desk-tray-aside" style={{ padding: '26px 24px', display: 'grid', gap: 0, alignContent: 'start' }}>
                <Kicker style={{ marginBottom: 12 }}>{periodLabel} at a glance</Kicker>
                <div style={{ display: 'grid', gap: 8 }}>
                    <GlanceRow label="In production" value={String(inProduction)} />
                    <GlanceRow label="Awaiting you" value={String(needsYouCount)} accent={needsYouCount > 0 ? 'var(--ochre)' : undefined} />
                    <GlanceRow label="Delivered" value={String(delivered)} />
                    <GlanceRow label="Outstanding" value={fmtMoney(outstanding)} accent={outstanding > 0 ? 'var(--brick)' : undefined} onClick={outstanding > 0 ? goStatements : undefined} />
                </div>

                {actions.notifyGet && <GetUpdates actions={actions} />}
                <WelcomeCard />
            </aside>
        </div>
    )
}

function GlanceRow({ label, value, accent, onClick }: { label: string; value: string; accent?: string; onClick?: () => void }) {
    return (
        <span
            onClick={onClick}
            style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--hairline-faint)', paddingBottom: 7, cursor: onClick ? 'pointer' : 'default' }}
        >
            <span className="desk-mono" style={{ letterSpacing: '0.08em', fontSize: '0.62rem', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{label}</span>
            <span className="desk-num" style={{ fontSize: '0.78rem', color: accent || 'var(--ink)', fontWeight: accent ? 700 : 400 }}>{value}</span>
        </span>
    )
}

/* ── Get updates (email + 6-digit OTP) ───────────────────────────────────── */
function GetUpdates({ actions }: { actions: DeliverableActions }) {
    const toast = useToast()
    const [stage, setStage] = useState<'load' | 'in' | 'code' | 'done'>('load')
    const [email, setEmail] = useState('')
    const [shown, setShown] = useState('')
    const [code, setCode] = useState('')
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!actions.notifyGet) return
        actions.notifyGet().then(r => {
            if (!r) { setStage('in'); return }
            if (r.verified && r.email) { setShown(r.email); setStage('done') }
            else if (r.pending) { setShown(r.pending); setStage('code') }
            else { setStage('in') }
        }).catch(() => setStage('in'))
        // eslint-disable-next-line
    }, [])

    const request = async () => {
        const e = email.trim()
        if (!e || busy || !actions.notifyRequest) return
        setBusy(true)
        const res = await actions.notifyRequest(e)
        setBusy(false)
        if (res.success) { setShown(e); setStage('code'); toast('info', 'We sent you a 6-digit code.') }
        else toast('err', res.error || 'Could not send the code.')
    }
    const verify = async () => {
        const c = code.trim()
        if (!c || busy || !actions.notifyVerify) return
        setBusy(true)
        const res = await actions.notifyVerify(c)
        setBusy(false)
        if (res.success) { setStage('done'); toast('ok', 'You’re set — we’ll email when something needs you.') }
        else toast('err', res.error || 'That code didn’t match.')
    }
    const remove = async () => {
        if (busy || !actions.notifyRemove) return
        setBusy(true)
        const res = await actions.notifyRemove()
        setBusy(false)
        if (res.success) { setEmail(''); setCode(''); setStage('in'); toast('info', 'Email updates turned off.') }
        else toast('err', res.error || 'Could not update.')
    }

    return (
        <div style={{ border: '1px solid var(--hairline)', background: 'var(--paper-sunken)', padding: 18, marginTop: 24, borderRadius: 4 }}>
            <Kicker style={{ marginBottom: 8 }}>Get updates</Kicker>
            {stage === 'load' && <p style={{ fontSize: '0.8rem', color: 'var(--ink-3)', margin: 0 }}>…</p>}
            {stage === 'in' && (
                <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-2)', margin: '0 0 12px' }}>One email when something needs you — nothing else.</p>
                    <input value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" className="desk-input" style={{ height: 34, marginBottom: 8, fontSize: '0.82rem' }} onKeyDown={e => { if (e.key === 'Enter') request() }} />
                    <Button variant="primary" size="sm" full disabled={busy || !email.trim()} onClick={request}>Get updates</Button>
                </>
            )}
            {stage === 'code' && (
                <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--ink-2)', margin: '0 0 10px' }}>We sent a 6-digit code to <strong>{shown}</strong>.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input value={code} onChange={e => setCode(e.target.value)} placeholder="6-digit code" className="desk-input desk-mono" style={{ height: 34, letterSpacing: '0.2em', fontSize: '0.8rem' }} onKeyDown={e => { if (e.key === 'Enter') verify() }} />
                        <Button variant="primary" size="sm" disabled={busy || !code.trim()} onClick={verify}>Verify</Button>
                    </div>
                    <p onClick={request} style={{ fontSize: '0.74rem', color: 'var(--ink-3)', marginTop: 8, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 }}>Resend code</p>
                </>
            )}
            {stage === 'done' && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <Check size={16} style={{ color: 'var(--sage)', flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                        <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.84rem' }}>{shown}</p>
                        <p className="desk-mono" style={{ fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--sage)', margin: '2px 0 0' }}>VERIFIED · RECEIVING UPDATES</p>
                    </span>
                    <button onClick={remove} disabled={busy} className="desk-iconbtn" style={{ width: 28, height: 28 }} aria-label="Turn off updates"><X size={14} /></button>
                </div>
            )}
        </div>
    )
}

function WelcomeCard() {
    const [open, setOpen] = useState(true)
    if (!open) return null
    return (
        <div style={{ border: '1px solid var(--hairline)', padding: 18, marginTop: 14, borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                <Kicker>New here?</Kicker>
                <button onClick={() => setOpen(false)} className="desk-iconbtn" style={{ marginLeft: 'auto', width: 24, height: 24 }} aria-label="Dismiss"><X size={12} /></button>
            </div>
            <div style={{ display: 'grid', gap: 9, fontSize: '0.8rem', color: 'var(--ink-2)' }}>
                <Bullet on>Videos open right here — watch and decide in the screening room.</Bullet>
                <Bullet>Notes pin to exact frames — the editor sees what you see.</Bullet>
                <Bullet>Statements carry a matching payment reference.</Bullet>
            </div>
        </div>
    )
}
function Bullet({ children, on }: { children: React.ReactNode; on?: boolean }) {
    return (
        <span style={{ display: 'flex', gap: 9, alignItems: 'start' }}>
            <span style={{ width: 13, height: 13, marginTop: 2, flexShrink: 0, borderRadius: '50%', border: `2px solid ${on ? 'var(--sage)' : 'var(--hairline-strong)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Check size={8} color="var(--sage)" strokeWidth={3.5} />}
            </span>
            {children}
        </span>
    )
}
