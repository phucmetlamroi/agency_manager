'use client'

import { useState } from 'react'
import { ReceiptText, CheckCircle2, Download, Info } from 'lucide-react'
import { StatusBadge, BrandAvatar, FilterChip, Empty } from './ui'
import { fmtMoney, fmtDate, mapInvoiceStatus } from './format'
import type { Invoice, Brand } from './types'

const FILTERS = ['All', 'Overdue', 'Due', 'Paid'] as const
type Filter = typeof FILTERS[number]

export default function InvoicesSurface({ invoices, brands, openInvoice, activeId, showPeriod }: {
    invoices: Invoice[]
    brands: Brand[]
    openInvoice: (id: string) => void
    activeId: string | null
    showPeriod?: boolean
}) {
    const [filter, setFilter] = useState<Filter>('All')
    const brandName = (id: number | null) => brands.find(b => b.id === id)?.name

    const list = filter === 'All' ? invoices : invoices.filter(i => mapInvoiceStatus(i.status) === filter)
    const unpaid = invoices.filter(i => { const s = mapInvoiceStatus(i.status); return s !== 'Paid' && s !== 'Void' })
    const outstanding = unpaid.reduce((a, i) => a + Number(i.totalDue || 0), 0)
    const overdue = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue')
    const overdueSum = overdue.reduce((a, i) => a + Number(i.totalDue || 0), 0)

    const counts: Record<Filter, number> = {
        'All': invoices.length,
        'Overdue': overdue.length,
        'Due': invoices.filter(i => mapInvoiceStatus(i.status) === 'Due').length,
        'Paid': invoices.filter(i => mapInvoiceStatus(i.status) === 'Paid').length,
    }
    const cols = '1.7fr 1fr 1fr 1fr 110px 40px'

    return (
        <div className="pc-view-in" style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 24px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--fg)' }}>Invoices</h1>
                <p style={{ margin: '5px 0 0', fontSize: 14, color: 'var(--fg-2)' }}>Your billing history. Download any statement as a PDF.</p>
            </div>

            {/* Summary strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', padding: '16px 20px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--line)' }}>
                <div>
                    <div className="eyebrow" style={{ fontSize: 10 }}>Outstanding</div>
                    <div className="num" style={{ fontSize: 24, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.01em', marginTop: 3 }}>{fmtMoney(outstanding)}</div>
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line)' }} />
                {overdue.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
                        <span style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>
                            <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{overdue.length} invoice{overdue.length > 1 ? 's' : ''} overdue</span> · {fmtMoney(overdueSum)}
                        </span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--fg-2)' }}>
                        <CheckCircle2 size={15} style={{ color: 'var(--ok)' }} /> Everything up to date
                    </div>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Billed in USD ($)</span>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <FilterChip key={f} label={f} count={counts[f]} active={filter === f} onClick={() => setFilter(f)}
                        dotColor={f === 'Overdue' ? 'var(--danger)' : f === 'Paid' ? 'var(--ok)' : null} />
                ))}
            </div>

            {/* Ledger */}
            {list.length === 0 ? (
                <div className="pc-card"><Empty icon={ReceiptText} title="No invoices" sub="No statements match this filter for the selected channel." /></div>
            ) : (
                <div className="pc-card" style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--line)' }}>
                        {['Invoice', 'Issued', 'Due', 'Amount', 'Status', ''].map((h, i) => (
                            <span key={i} className="eyebrow" style={{ fontSize: 9.5, textAlign: i === 3 ? 'right' : 'left' }}>{h}</span>
                        ))}
                    </div>
                    <div className="pc-stagger">
                        {list.map(inv => {
                            const led = mapInvoiceStatus(inv.status)
                            return (
                                <button key={inv.id} onClick={() => openInvoice(inv.id)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = activeId === inv.id ? 'var(--surface-2)' : 'transparent'}
                                    style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center', width: '100%', padding: '14px 18px', background: activeId === inv.id ? 'var(--surface-2)' : 'transparent', border: 'none', borderBottom: '1px solid var(--line)', cursor: 'pointer', textAlign: 'left', transition: 'background .12s' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                        <BrandAvatar name={brandName(inv.clientId) || inv.invoiceNumber} id={inv.clientId ?? inv.invoiceNumber} size={34} radius={9} />
                                        <span style={{ minWidth: 0 }}>
                                            <span className="num" style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--fg)' }}>{inv.invoiceNumber}</span>
                                            <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brandName(inv.clientId) || '—'}{showPeriod && inv.workspaceName ? ` · ${inv.workspaceName}` : ''}</span>
                                        </span>
                                    </span>
                                    <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>{fmtDate(inv.issueDate, false)}</span>
                                    <span style={{ fontSize: 13, color: led === 'Overdue' ? 'var(--danger)' : 'var(--fg-2)', fontWeight: led === 'Overdue' ? 600 : 400 }}>{fmtDate(inv.dueDate, false)}</span>
                                    <span className="num" style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', textAlign: 'right' }}>{fmtMoney(inv.totalDue)}</span>
                                    <span><StatusBadge status={led} compact /></span>
                                    <span style={{ display: 'inline-flex', justifyContent: 'center', color: 'var(--fg-4)' }}><Download size={16} /></span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
            <p style={{ margin: '2px 4px', fontSize: 12, color: 'var(--fg-4)', display: 'flex', alignItems: 'center', gap: 7 }}>
                <Info size={13} /> Payments are handled outside the portal — see your statement for bank details.
            </p>
        </div>
    )
}
