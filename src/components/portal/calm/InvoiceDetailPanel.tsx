'use client'

import { X, Download } from 'lucide-react'
import { StatusBadge } from './ui'
import { fmtMoney, fmtDate, mapInvoiceStatus } from './format'
import type { Invoice, Brand } from './types'

export default function InvoiceDetailPanel({ inv, brands, onClose }: {
    inv: Invoice
    brands: Brand[]
    onClose: () => void
}) {
    const led = mapInvoiceStatus(inv.status)
    const brandName = brands.find(b => b.id === inv.clientId)?.name || '—'

    return (
        <>
            <div className="pc-scrim-in" onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 80 }} />
            <div className="pc-panel-in" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, maxWidth: '94vw', zIndex: 81, background: 'var(--surface)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '18px 20px', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>{brandName}</div>
                        <h2 className="num" style={{ margin: '3px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--fg)' }}>{inv.invoiceNumber}</h2>
                    </div>
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
                    {/* Amount + status */}
                    <div>
                        <div className="eyebrow" style={{ fontSize: 10, marginBottom: 6 }}>Amount due</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <span className="num" style={{ fontSize: 38, fontWeight: 800, color: 'var(--fg)', letterSpacing: '-0.02em', lineHeight: 1 }}>{fmtMoney(inv.totalDue)}</span>
                            <StatusBadge status={led} />
                        </div>
                        {led === 'Overdue' && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--danger)' }}>This statement was due on {fmtDate(inv.dueDate)}.</p>}
                        {led === 'Paid' && <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--fg-3)' }}>Paid. Thank you.</p>}
                    </div>

                    {/* Dates */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className="pc-card" style={{ padding: '13px 15px', background: 'var(--surface-2)' }}>
                            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 4 }}>Issued</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{fmtDate(inv.issueDate)}</div>
                        </div>
                        <div className="pc-card" style={{ padding: '13px 15px', background: 'var(--surface-2)' }}>
                            <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginBottom: 4 }}>Due</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: led === 'Overdue' ? 'var(--danger)' : 'var(--fg-1)' }}>{fmtDate(inv.dueDate)}</div>
                        </div>
                    </div>

                    {/* Line items */}
                    {inv.items.length > 0 && (
                        <div>
                            <p className="eyebrow" style={{ fontSize: 10, marginBottom: 10 }}>What this covers</p>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {inv.items.map((it, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                                        <span style={{ fontSize: 13.5, color: 'var(--fg-2)' }}>{it.description}{it.quantity > 1 ? ` ×${it.quantity}` : ''}</span>
                                        <span className="num" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--fg-1)', flexShrink: 0 }}>{fmtMoney(it.amount)}</span>
                                    </div>
                                ))}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 0 0' }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--fg)' }}>Total</span>
                                    <span className="num" style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg)' }}>{fmtMoney(inv.totalDue)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {inv.filePath
                        ? <a href={inv.filePath} target="_blank" rel="noopener noreferrer" className="pc-btn pc-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}><Download size={16} /> Download PDF</a>
                        : <button className="pc-btn pc-btn-ghost" disabled style={{ width: '100%', justifyContent: 'center' }}><Download size={16} /> PDF not available yet</button>}
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--fg-4)', textAlign: 'center', lineHeight: 1.5 }}>Bank transfer details are printed on the statement.<br />Questions? Message your team any time.</p>
                </div>
            </div>
        </>
    )
}
