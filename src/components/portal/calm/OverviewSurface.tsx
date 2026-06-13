'use client'

import { Clapperboard, Eye, CheckCheck, Wallet, Hand, AlertCircle, ArrowRight } from 'lucide-react'
import { StatusBadge, BrandAvatar } from './ui'
import { fmtMoney, fmtDate, relDeadline, mapInvoiceStatus } from './format'
import type { Deliverable, Invoice, Brand, SurfaceId } from './types'

function greetingWord() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
}

function StatTile({ label, value, sub, accent, Icon }: { label: string; value: string | number; sub?: string | null; accent?: string | null; Icon: any }) {
    const on = !!accent
    return (
        <div className="pc-card" style={{ padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', overflow: 'hidden' }}>
            {on && <span style={{ position: 'absolute', top: 0, left: 18, right: 18, height: 2, borderRadius: 2, background: accent!, opacity: 0.55 }} />}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="eyebrow" style={{ fontSize: 10 }}>{label}</span>
                <span style={{ width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'color-mix(in srgb, ' + accent + ' 13%, transparent)' : 'var(--surface-2)', border: '1px solid ' + (on ? 'color-mix(in srgb, ' + accent + ' 30%, transparent)' : 'var(--line-2)'), color: on ? accent! : 'var(--fg-3)' }}>
                    <Icon size={14} />
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.01em', color: accent || 'var(--fg)', lineHeight: 1 }}>{value}</span>
                {sub && <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{sub}</span>}
            </div>
        </div>
    )
}

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
    const inProduction = deliverables.filter(d => ['Pending', 'In Progress', 'Revising'].includes(d.clientStatus)).length
    const awaiting = deliverables.filter(d => d.needsYou)
    const now = new Date()
    const delivered = deliverables.filter(d => d.clientStatus === 'Completed' && new Date(d.updatedAt).getMonth() === now.getMonth() && new Date(d.updatedAt).getFullYear() === now.getFullYear()).length
    const unpaid = invoices.filter(i => { const s = mapInvoiceStatus(i.status); return s !== 'Paid' && s !== 'Void' })
    const outstanding = unpaid.reduce((a, i) => a + Number(i.totalDue || 0), 0)
    const overdueInvs = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue')

    const attention = [
        ...awaiting.map(d => ({ kind: 'review' as const, d })),
        ...overdueInvs.map(i => ({ kind: 'overdue' as const, i })),
    ]

    const recent = [...deliverables].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
    const upcoming = deliverables.filter(d => d.clientStatus !== 'Completed' && d.deadline)
        .sort((a, b) => (a.deadline || '').localeCompare(b.deadline || '')).slice(0, 4)

    const firstName = (contactName || '').trim().split(/\s+/)[0] || 'there'
    const scopeLabel = scope === 'all' ? 'all your channels' : (brands.find(b => b.id === scope)?.name || 'this channel')

    return (
        <div className="pc-view-in" style={{ maxWidth: 1180, margin: '0 auto', padding: '30px 24px 48px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Greeting */}
            <div>
                <p className="eyebrow" style={{ marginBottom: 9, color: 'var(--accent-fg)' }}>Your studio room</p>
                <h1 style={{ margin: 0, fontSize: 33, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg)', lineHeight: 1.04 }}>{greetingWord()}, {firstName}</h1>
                <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--fg-2)' }}>
                    Here&apos;s where things stand across <span style={{ color: 'var(--fg-1)', fontWeight: 600 }}>{scopeLabel}</span>
                    {periodLabel && <> in <span style={{ color: 'var(--accent-fg)', fontWeight: 600 }}>{periodLabel}</span></>}.
                </p>
            </div>

            {/* Needs your attention */}
            {attention.length > 0 && (
                <div className="pc-card" style={{ borderColor: 'var(--accent-line)', background: 'linear-gradient(180deg, var(--accent-soft), var(--surface) 60%)', padding: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', color: 'var(--accent-fg)' }}><Hand size={16} /></span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.25 }}>Needs your attention</h2>
                            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--fg-3)' }}>{attention.length} {attention.length === 1 ? 'item is' : 'items are'} waiting on you</p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {attention.map((it) => it.kind === 'review' ? (
                            <button key={'r' + it.d.id} onClick={() => openDeliverable(it.d.id)}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--line-hover)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-2)'}
                                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line-2)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color .15s' }}>
                                <BrandAvatar name={it.d.client?.name || '—'} id={it.d.client?.id} size={32} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.d.title}</div>
                                    <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>Ready for your review · {it.d.client?.name || '—'}</div>
                                </div>
                                <span className="pc-btn pc-btn-primary" style={{ pointerEvents: 'none', padding: '7px 13px', fontSize: 13 }}>Review</span>
                            </button>
                        ) : (
                            <button key={'o' + it.i.id} onClick={() => openInvoice(it.i.id)}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--danger-line)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--line-2)'}
                                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line-2)', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'border-color .15s' }}>
                                <span style={{ width: 32, height: 32, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--danger-soft)', border: '1px solid var(--danger-line)', color: 'var(--danger)' }}><AlertCircle size={16} /></span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{it.i.invoiceNumber} is overdue</div>
                                    <div style={{ fontSize: 12, color: 'var(--fg-3)' }}>{fmtMoney(it.i.totalDue)} · was due {fmtDate(it.i.dueDate, false)}</div>
                                </div>
                                <ArrowRight size={17} style={{ color: 'var(--fg-3)' }} />
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* At-a-glance */}
            <div className="pc-stagger pc-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
                <StatTile label="In production" value={inProduction} sub="deliverables" Icon={Clapperboard} />
                <StatTile label="Awaiting you" value={awaiting.length} sub={awaiting.length === 1 ? 'review' : 'reviews'} Icon={Eye} accent={awaiting.length ? 'var(--attn)' : null} />
                <StatTile label="Delivered" value={delivered} sub="this month" Icon={CheckCheck} accent={delivered ? 'var(--ok)' : null} />
                <StatTile label="Outstanding" value={fmtMoney(outstanding)} sub={overdueInvs.length ? `${overdueInvs.length} overdue` : null} Icon={Wallet} accent={overdueInvs.length ? 'var(--danger)' : null} />
            </div>

            {/* Recent + Upcoming */}
            <div className="pc-overview-cols" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
                <div className="pc-card" style={{ padding: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 14px 10px' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>Latest activity</h2>
                        <button onClick={() => onNav('deliverables')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 12.5, fontWeight: 600 }}>
                            All deliverables <ArrowRight size={13} />
                        </button>
                    </div>
                    <div>
                        {recent.length === 0 && <div style={{ padding: '10px 14px 16px', fontSize: 13, color: 'var(--fg-3)' }}>Nothing yet.</div>}
                        {recent.map(d => (
                            <button key={d.id} onClick={() => openDeliverable(d.id)}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%', background: 'transparent', border: 'none', transition: 'background .12s' }}>
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

                <div className="pc-card" style={{ padding: 6 }}>
                    <div style={{ padding: '14px 14px 10px' }}>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>Coming up</h2>
                    </div>
                    <div>
                        {upcoming.length === 0 && <div style={{ padding: '10px 14px 16px', fontSize: 13, color: 'var(--fg-3)' }}>Nothing scheduled.</div>}
                        {upcoming.map(d => {
                            const rel = relDeadline(d.deadline)
                            return (
                                <button key={d.id} onClick={() => openDeliverable(d.id)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', width: '100%', background: 'transparent', border: 'none', transition: 'background .12s' }}>
                                    <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 4, background: rel.urgent ? 'var(--attn)' : 'var(--line-hover)', margin: '3px 0' }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                                        <div style={{ fontSize: 12, color: rel.urgent ? 'var(--attn)' : 'var(--fg-3)', marginTop: 1, fontWeight: rel.urgent ? 600 : 400 }}>{rel.text}</div>
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
