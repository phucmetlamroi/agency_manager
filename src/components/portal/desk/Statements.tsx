'use client'

/* THE DESK — Statements (billing). Master ledger + detail aside with line items
   and a copy-ready payment reference. Real USD, real invoice data. */

import { useEffect, useMemo, useState } from 'react'
import { FileText, Copy, Check, Download } from 'lucide-react'
import { Kicker, Empty, useToast } from './ui'
import { fmtMoney, fmtDate, mapInvoiceStatus, relDeadline } from '../calm/format'
import { toneColor, deskStatus } from './status'
import type { Invoice } from '../calm/types'

const ORDER: Record<string, number> = { Overdue: 0, Due: 1, Paid: 2, Void: 3 }

export default function Statements({ invoices, activeId, openInvoice }: {
    invoices: Invoice[]
    activeId: string | null
    openInvoice: (id: string) => void
}) {
    const toast = useToast()
    const rows = useMemo(() =>
        [...invoices].sort((a, b) => (ORDER[mapInvoiceStatus(a.status)] ?? 9) - (ORDER[mapInvoiceStatus(b.status)] ?? 9) || (new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())),
        [invoices])

    const [sel, setSel] = useState<string | null>(activeId ?? rows[0]?.id ?? null)
    useEffect(() => { if (activeId) setSel(activeId) }, [activeId])

    const pastDue = invoices.filter(i => mapInvoiceStatus(i.status) === 'Overdue').reduce((s, i) => s + Number(i.totalDue || 0), 0)
    const due = invoices.filter(i => mapInvoiceStatus(i.status) === 'Due').reduce((s, i) => s + Number(i.totalDue || 0), 0)

    const active = rows.find(i => i.id === sel) || null

    if (invoices.length === 0) {
        return (
            <main style={{ padding: '26px 30px' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: '0 0 16px' }}>Statements</h1>
                <Empty icon={FileText} title="No statements yet" sub="Invoices for your work appear here — billed in USD by bank transfer." />
            </main>
        )
    }

    return (
        <div className="desk-st-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 440px', minHeight: 'calc(100vh - 58px)' }}>
            <main className="desk-st-main" style={{ padding: '26px 30px', borderRight: '1px solid var(--hairline)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
                    <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: 0 }}>Statements</h1>
                    <span className="desk-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>BILLED IN USD · BANK TRANSFER</span>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--ink-2)', margin: '0 0 20px' }}>
                    {pastDue > 0 && <><strong style={{ color: 'var(--brick)' }}>{fmtMoney(pastDue)} past due</strong>{due > 0 || ' · everything else settled.'}</>}
                    {pastDue > 0 && due > 0 && ' · '}
                    {due > 0 && <>{fmtMoney(due)} due soon · everything else settled.</>}
                    {pastDue === 0 && due === 0 && 'Everything is settled — thank you.'}
                </p>

                {rows.map(i => {
                    const st = mapInvoiceStatus(i.status)
                    const s = deskStatus(st)
                    const rel = st === 'Paid' || st === 'Void' ? null : relDeadline(i.dueDate)
                    const on = i.id === sel
                    return (
                        <div key={i.id} onClick={() => { setSel(i.id); openInvoice(i.id) }} style={{ display: 'grid', gridTemplateColumns: '24px minmax(0,1.3fr) 1fr 1fr 110px', gap: 14, alignItems: 'center', padding: '13px 16px', borderTop: '1px solid var(--hairline-faint)', background: on ? 'var(--paper-tint)' : 'transparent', borderLeft: '2px solid ' + (on ? toneColor(s.tone) : 'transparent'), cursor: 'pointer' }}
                            onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--paper-tint)' }}
                            onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent' }}>
                            <FileText size={14} style={{ color: 'var(--ink-3)' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.9rem' }} className="desk-truncate">{i.invoiceNumber}</span>
                            <span className="desk-mono" style={{ fontSize: '0.66rem', color: rel && rel.urgent ? 'var(--brick)' : 'var(--ink-3)' }}>{rel ? rel.text : (i.dueDate ? fmtDate(i.dueDate, false) : '—')}</span>
                            <span className="desk-num" style={{ fontSize: '0.76rem', textAlign: 'right' }}>{fmtMoney(i.totalDue)}</span>
                            <span className="desk-mono" style={{ textAlign: 'right', fontSize: '0.62rem', letterSpacing: '0.08em', color: toneColor(s.tone), textTransform: 'uppercase' }}>{s.label}</span>
                        </div>
                    )
                })}
                <p style={{ fontSize: '0.78rem', color: 'var(--ink-3)', marginTop: 16 }}>Select a statement to see its lines and payment reference.</p>
            </main>

            <aside style={{ padding: '26px 28px', background: 'var(--paper-raised)', overflowY: 'auto' }}>
                {active ? <StatementDetail inv={active} onCopy={(t) => { navigator.clipboard?.writeText(t).then(() => toast('ok', 'Copied.')).catch(() => {}) }} /> : (
                    <p style={{ fontSize: '0.86rem', color: 'var(--ink-3)' }}>Select a statement.</p>
                )}
            </aside>
        </div>
    )
}

function StatementDetail({ inv, onCopy }: { inv: Invoice; onCopy: (t: string) => void }) {
    const st = mapInvoiceStatus(inv.status)
    const s = deskStatus(st)
    const items = inv.items || []
    const showPdf = inv.filePath && /^https?:\/\//i.test(inv.filePath)
    return (
        <div className="desk-rise">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h2 className="desk-display" style={{ fontSize: '1.3rem', margin: 0 }}>{inv.invoiceNumber}</h2>
                <span className="desk-mono" style={{ fontSize: '0.62rem', letterSpacing: '0.1em', color: toneColor(s.tone), textTransform: 'uppercase' }}>{s.label}</span>
            </div>
            <p className="desk-mono" style={{ fontSize: '0.64rem', color: 'var(--ink-3)', margin: '0 0 16px', letterSpacing: '0.04em' }}>
                ISSUED {fmtDate(inv.issueDate, false)}{inv.dueDate ? ` · DUE ${fmtDate(inv.dueDate, false)}` : ''}{inv.workspaceName ? ` · ${inv.workspaceName.toUpperCase()}` : ''}
            </p>
            <p className="desk-num" style={{ fontSize: '1.7rem', fontWeight: 700, margin: '0 0 2px' }}>{fmtMoney(inv.totalDue)}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-2)', margin: '0 0 18px' }}>{st === 'Paid' ? 'Settled — thank you.' : st === 'Overdue' ? 'This balance is past due.' : 'Total due for this statement.'}</p>

            {items.length > 0 && (
                <div style={{ display: 'grid', gap: 8, fontSize: '0.85rem', borderTop: '1px solid var(--hairline)', paddingTop: 12, marginBottom: 18 }}>
                    {items.map((it, i) => (
                        <span key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <span style={{ minWidth: 0 }}>{it.description}{it.quantity > 1 ? <span className="desk-muted"> × {it.quantity}</span> : null}</span>
                            <span className="desk-num" style={{ fontSize: '0.74rem', flex: 'none' }}>{fmtMoney(Number(it.amount) * (it.quantity || 1))}</span>
                        </span>
                    ))}
                    <span style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--hairline-strong)', paddingTop: 9, fontWeight: 600 }}>
                        <span>Total</span><span className="desk-num" style={{ fontSize: '0.8rem' }}>{fmtMoney(inv.totalDue)}</span>
                    </span>
                </div>
            )}

            {st !== 'Paid' && st !== 'Void' && (
                <div style={{ background: 'var(--paper-sunken)', border: '1px solid var(--hairline)', padding: '16px 18px', marginBottom: 16, borderRadius: 4 }}>
                    <Kicker style={{ marginBottom: 12 }}>How to pay — bank transfer</Kicker>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--hairline-faint)' }}>
                        <span className="desk-mono" style={{ width: 104, fontSize: '0.56rem', letterSpacing: '0.1em', color: 'var(--ink-3)', flex: 'none' }}>REFERENCE</span>
                        <span className="desk-mono" style={{ fontSize: '0.72rem' }}>{inv.invoiceNumber}</span>
                        <button onClick={() => onCopy(inv.invoiceNumber)} className="desk-iconbtn" style={{ marginLeft: 'auto', width: 26, height: 26 }} aria-label="Copy reference"><Copy size={12} /></button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
                        <span className="desk-mono" style={{ width: 104, fontSize: '0.56rem', letterSpacing: '0.1em', color: 'var(--ink-3)', flex: 'none' }}>AMOUNT</span>
                        <span className="desk-mono" style={{ fontSize: '0.72rem' }}>{fmtMoney(inv.totalDue)}</span>
                        <button onClick={() => onCopy(String(inv.totalDue))} className="desk-iconbtn" style={{ marginLeft: 'auto', width: 26, height: 26 }} aria-label="Copy amount"><Copy size={12} /></button>
                    </div>
                    <p style={{ fontSize: '0.74rem', color: 'var(--ink-2)', marginTop: 10 }}>Bank details are on the PDF. Include the reference and we match transfers the same day — this flips to <strong style={{ color: 'var(--sage)' }}>Paid</strong>.</p>
                </div>
            )}
            {st === 'Paid' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 14px', background: 'var(--sage-tint)', border: '1px solid color-mix(in srgb, var(--sage) 28%, transparent)', borderRadius: 4, marginBottom: 16 }}>
                    <Check size={15} style={{ color: 'var(--sage)' }} /><span style={{ fontSize: '0.84rem' }}>Paid in full — thank you.</span>
                </div>
            )}

            {showPdf && (
                <a href={inv.filePath!} target="_blank" rel="noopener noreferrer" className="desk-btn desk-btn--quiet desk-btn--sm" style={{ textDecoration: 'none' }}>
                    <Download size={14} /> Download PDF
                </a>
            )}
        </div>
    )
}
