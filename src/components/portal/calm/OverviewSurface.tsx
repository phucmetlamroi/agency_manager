'use client'

import { Eye, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { StatusBadge, BrandAvatar } from './ui'
import { fmtMoney, fmtDate, relDeadline, mapInvoiceStatus } from './format'
import type { Deliverable, Invoice, Brand, SurfaceId } from './types'

function greetingWord() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
}

/* [Redesign P3] A calm, focused landing: one clear "Needs your review" block
   up top, then a quiet billing nudge, then recent + upcoming work. The old
   4-tile KPI grid is folded into a single prose stat line; work and billing
   are no longer mixed in one card. */
export default function OverviewSurface({ deliverables, invoices, scope, brands, contactName, periodLabel, onNav, openDeliverable, openInvoice }: {
    deliverables: Deliverable[]
    invoices: Invoice[]
    scope: number | 'all'
    brands: Brand[]
    contactName: string
    periodLabel?: string | null
    onNav: (id: SurfaceId) => void
    openDeliverable: (id: string) => void
    openInvoice: (id: string) => void
}) {
    const awaiting = deliverables.filter(d => d.needsYou)
    const now = new Date()
    const active = deliverables.filter(d => d.clientStatus !== 'Completed' && d.clientStatus !== 'Closed').length
    const delivered = deliverables.filter(d => d.clientStatus === 'Completed' && new Date(d.updatedAt).getMonth() === now.getMonth() && new Date(d.updatedAt).getFullYear() === now.getFullYear()).length
    const unpaid = invoices.filter(i => { const s = mapInvoiceStatus(i.status); return s !== 'Paid' && s !== 'Void' })
    const outstanding = unpaid.reduce((a, i) => a + Number(i.totalDue || 0), 0)
    const overdueInvs = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue')
    const overdueSum = overdueInvs.reduce((a, i) => a + Number(i.totalDue || 0), 0)

    const recent = [...deliverables].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
    const upcoming = deliverables.filter(d => d.clientStatus !== 'Completed' && d.clientStatus !== 'Closed' && d.deadline)
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')).slice(0, 4)

    const firstName = (contactName || '').trim().split(/\s+/)[0] || 'there'
    const scopeLabel = scope === 'all' ? 'your channels' : (brands.find(b => b.id === scope)?.name || 'this channel')

    const statBits = [
        `${active} in production`,
        `${delivered} delivered this month`,
        outstanding > 0 ? `${fmtMoney(outstanding)} outstanding` : null,
    ].filter(Boolean) as string[]

    return (
        <div className="pc-view-in" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 28px 56px', display: 'flex', flexDirection: 'column', gap: 30 }}>
            {/* Greeting */}
            <div>
                <p className="eyebrow" style={{ marginBottom: 10, color: 'var(--accent-fg)' }}>Your studio room</p>
                <h1 style={{ margin: 0, fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)', lineHeight: 1.04 }}>{greetingWord()}, {firstName}</h1>
                <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                    Here&apos;s where things stand across <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{scopeLabel}</span>
                    {periodLabel && <> in <span style={{ color: 'var(--accent-fg)', fontWeight: 600 }}>{periodLabel}</span></>}.
                </p>
                {statBits.length > 0 && (
                    <p className="num" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>{statBits.join('  ·  ')}</p>
                )}
            </div>

            {/* Needs your review — the one thing that matters first */}
            {awaiting.length > 0 ? (
                <section>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13 }}>
                        <Eye size={17} style={{ color: 'var(--accent-fg)' }} />
                        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: 'var(--fg)' }}>Needs your review</h2>
                        <span className="num" style={{ fontSize: 13, color: 'var(--fg-3)' }}>{awaiting.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                        {awaiting.map(d => (
                            <button key={d.id} onClick={() => openDeliverable(d.id)}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-line)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.background = 'var(--surface)' }}
                                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 15px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line-2)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color .15s, background .15s', boxShadow: 'var(--shadow-1)' }}>
                                <BrandAvatar name={d.client?.name || '—'} id={d.client?.id} size={34} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                                    <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 1 }}>Ready for your review · {d.client?.name || '—'}</div>
                                </div>
                                <span className="pc-btn pc-btn-primary" style={{ pointerEvents: 'none', padding: '8px 15px', fontSize: 13 }}>Review</span>
                            </button>
                        ))}
                    </div>
                </section>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '18px 20px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--shadow-1)' }}>
                    <span style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', color: 'var(--ok)' }}><CheckCircle2 size={19} /></span>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>You&apos;re all caught up</div>
                        <div style={{ fontSize: 13, color: 'var(--fg-3)', marginTop: 1 }}>Nothing needs your review right now — we&apos;ll let you know the moment a cut is ready.</div>
                    </div>
                </div>
            )}

            {/* Quiet billing nudge — only when something is overdue, kept subordinate */}
            {overdueInvs.length > 0 && (
                <button onClick={() => onNav('invoices')}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--danger-line)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-2)'}
                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 15px', borderRadius: 12, background: 'var(--danger-soft)', border: '1px solid var(--line-2)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color .15s' }}>
                    <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13.5, color: 'var(--fg-1)' }}>
                        {overdueInvs.length === 1 ? 'An invoice is' : `${overdueInvs.length} invoices are`} overdue · <span className="num" style={{ fontWeight: 600 }}>{fmtMoney(overdueSum)}</span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color: 'var(--fg-3)' }}>View invoices <ArrowRight size={13} /></span>
                </button>
            )}

            {/* Recent + Upcoming */}
            <div className="pc-overview-cols" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 22 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 2px' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>Latest activity</h2>
                        <button onClick={() => onNav('deliverables')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 12.5, fontWeight: 600 }}>
                            All deliverables <ArrowRight size={13} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {recent.length === 0 && <div style={{ padding: '8px 2px 0', fontSize: 13, color: 'var(--fg-3)' }}>Nothing yet.</div>}
                        {recent.map((d, i) => (
                            <button key={d.id} onClick={() => openDeliverable(d.id)}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 10px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--line)', transition: 'background .12s' }}>
                                <BrandAvatar name={d.client?.name || '—'} id={d.client?.id} size={32} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 1 }}>{fmtDate(d.updatedAt, false)}</div>
                                </div>
                                <StatusBadge status={d.clientStatus} compact />
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 600, color: 'var(--fg)', padding: '0 2px' }}>Coming up</h2>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {upcoming.length === 0 && <div style={{ padding: '8px 2px 0', fontSize: 13, color: 'var(--fg-3)' }}>Nothing scheduled.</div>}
                        {upcoming.map((d, i) => {
                            const rel = relDeadline(d.deadline)
                            return (
                                <button key={d.id} onClick={() => openDeliverable(d.id)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 10px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid var(--line)', transition: 'background .12s' }}>
                                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: rel.urgent ? 'var(--accent)' : 'var(--line-hover)', margin: '2px 0' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                                        <div style={{ fontSize: 12, color: rel.urgent ? 'var(--accent-fg)' : 'var(--fg-3)', marginTop: 1, fontWeight: rel.urgent ? 600 : 400 }}>{rel.text}</div>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </div>
            </div>
        </div>
    )
}
