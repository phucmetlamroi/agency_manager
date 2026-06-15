'use client'

import { useEffect, useState } from 'react'
import { X, Loader2, Wallet, Trash2, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { recordPayment, getClientPayments, deletePayment } from '@/actions/payment-actions'

type PaymentRow = { id: string; amount: number; paidAt: string; method: string | null; note: string | null; invoiceId: string | null; recordedBy: string | null }

const usd = (n: number) => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US')
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })

export default function RecordPaymentModal({ clientId, clientName, owed, paid, workspaceId, onClose, onSaved }: {
    clientId: number
    clientName: string
    owed: number
    paid: number
    workspaceId: string
    onClose: () => void
    onSaved: () => void
}) {
    const remaining = Math.max(0, owed - paid)
    const [amount, setAmount] = useState<string>(remaining > 0 ? String(Math.round(remaining * 100) / 100) : '')
    const [paidAt, setPaidAt] = useState(today())
    const [method, setMethod] = useState('')
    const [note, setNote] = useState('')
    const [busy, setBusy] = useState(false)
    const [history, setHistory] = useState<PaymentRow[]>([])
    const [loadingHist, setLoadingHist] = useState(true)

    const loadHistory = async () => {
        setLoadingHist(true)
        const res = await getClientPayments(clientId, workspaceId)
        setLoadingHist(false)
        if (res.success) setHistory(res.payments)
    }
    useEffect(() => { loadHistory() }, [clientId, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

    const submit = async () => {
        const amt = Number(amount)
        if (!Number.isFinite(amt) || amt <= 0) { toast.error('Nhập số tiền hợp lệ (> 0).'); return }
        setBusy(true)
        const res = await recordPayment(
            { clientId, amount: amt, paidAt: new Date(paidAt + 'T00:00:00').toISOString(), method: method.trim() || undefined, note: note.trim() || undefined },
            workspaceId,
        )
        setBusy(false)
        if (res.success) {
            toast.success('Đã ghi nhận thanh toán.')
            setNote(''); setMethod('')
            await loadHistory()
            onSaved()
        } else {
            toast.error(res.error || 'Không ghi nhận được.')
        }
    }

    const remove = async (id: string) => {
        const res = await deletePayment(id, workspaceId)
        if (res.success) { toast.success('Đã xoá bản ghi.'); await loadHistory(); onSaved() }
        else toast.error(res.error || 'Không xoá được.')
    }

    const histTotal = history.reduce((s, h) => s + h.amount, 0)
    const input = { width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(39,39,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 13, outline: 'none' } as const
    const label = { fontSize: 11, fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase' as const, letterSpacing: '0.04em', marginBottom: 6, display: 'block' }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', padding: 20 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, background: '#0A0A0A', border: '1px solid rgba(139,92,246,0.2)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }} className="custom-scrollbar">
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }}><Wallet size={17} /></span>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Ghi nhận thu tiền</div>
                            <div style={{ fontSize: 12, color: '#a1a1aa' }}>{clientName}</div>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: '#a1a1aa', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                </div>

                {/* Owed/paid summary */}
                <div style={{ display: 'flex', gap: 10, padding: '14px 20px 4px' }}>
                    {[['Cần thu', usd(owed), '#fff'], ['Đã thu', usd(paid), '#34d399'], ['Còn lại', usd(remaining), remaining > 0 ? '#fbbf24' : '#34d399']].map(([l, v, c]) => (
                        <div key={l} style={{ flex: 1, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: 10, color: '#71717a', fontWeight: 700, textTransform: 'uppercase' }}>{l}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: c as string, fontFamily: 'ui-monospace, monospace' }}>{v}</div>
                        </div>
                    ))}
                </div>

                {/* Form */}
                <div style={{ padding: '14px 20px' }}>
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ flex: 1 }}>
                            <label style={label}>Số tiền đã nhận ($)</label>
                            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" style={input} autoFocus />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={label}>Ngày nhận</label>
                            <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={input} />
                        </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <label style={label}>Hình thức (tùy chọn)</label>
                        <input value={method} onChange={(e) => setMethod(e.target.value)} placeholder="vd: Chuyển khoản Vietcombank, Tiền mặt, MoMo…" style={input} maxLength={60} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                        <label style={label}>Ghi chú (tùy chọn)</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="vd: trả 1 nửa, phần còn lại tháng sau…" style={{ ...input, resize: 'vertical', lineHeight: 1.5 }} maxLength={300} />
                    </div>
                    <button onClick={submit} disabled={busy} style={{ marginTop: 14, width: '100%', padding: '11px', borderRadius: 11, background: busy ? 'rgba(139,92,246,0.5)' : '#7c3aed', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Ghi nhận đã thu
                    </button>
                </div>

                {/* History */}
                <div style={{ padding: '4px 20px 20px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                        <span>Lịch sử thu ({history.length})</span>
                        {history.length > 0 && <span style={{ color: '#34d399' }}>Tổng: {usd(histTotal)}</span>}
                    </div>
                    {loadingHist ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#71717a', fontSize: 12, padding: '8px 0' }}><Loader2 size={13} className="animate-spin" /> Đang tải…</div>
                    ) : history.length === 0 ? (
                        <div style={{ fontSize: 12, color: '#52525b', fontStyle: 'italic', padding: '8px 0' }}>Chưa có lần thu nào.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {history.map((h) => (
                                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 14, fontWeight: 700, color: '#34d399', fontFamily: 'ui-monospace, monospace' }}>{usd(h.amount)}</span>
                                            <span style={{ fontSize: 11, color: '#a1a1aa' }}>{fmtDate(h.paidAt)}</span>
                                            {h.method && <span style={{ fontSize: 10.5, color: '#71717a' }}>· {h.method}</span>}
                                        </div>
                                        {h.note && <div style={{ fontSize: 11.5, color: '#a1a1aa', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.note}</div>}
                                        {h.recordedBy && <div style={{ fontSize: 10, color: '#52525b', marginTop: 1 }}>bởi {h.recordedBy}</div>}
                                    </div>
                                    <button onClick={() => remove(h.id)} title="Xoá" style={{ width: 26, height: 26, borderRadius: 7, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
