'use client'

import { useMemo, useState } from 'react'
import { Search, CheckCircle2, Clock, AlertCircle, Plus, Wallet } from 'lucide-react'

type Task = { id: string | number; jobPriceUSD?: number }
type Client = { id: number; name: string; tasks?: Task[]; subsidiaries?: Client[] }
type LedgerEntry = { paid: number; lastPaidAt: string | null; count: number }

const usd = (n: number) => '$' + (Math.round((n || 0) * 100) / 100).toLocaleString('en-US')
const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

/** "Cần thu" = sum of jobPriceUSD over the client's own + subsidiaries' tasks (matches the Revenue column). */
function owedOf(c: Client): number {
    const own = (c.tasks || []).reduce((s, t) => s + (t.jobPriceUSD || 0), 0)
    const sub = (c.subsidiaries || []).reduce(
        (s, x) => s + (x.tasks || []).reduce((a, t) => a + (t.jobPriceUSD || 0), 0), 0,
    )
    return own + sub
}

const GRID = '2fr 1fr 1fr 1fr 1.1fr 0.9fr'

export default function PaymentLedger({ clients, byClient, onRecord }: {
    clients: Client[]
    byClient: Record<number, LedgerEntry>
    onRecord: (clientId: number, owed: number, paid: number) => void
}) {
    const [q, setQ] = useState('')
    const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all')

    const rows = useMemo(() => clients.map((c) => {
        const owed = owedOf(c)
        const paid = byClient[c.id]?.paid || 0
        const remaining = Math.max(0, owed - paid)
        const status: 'none' | 'partial' | 'full' =
            paid <= 0 ? 'none' : paid >= owed - 0.001 ? 'full' : 'partial'
        return { c, owed, paid, remaining, status, lastPaidAt: byClient[c.id]?.lastPaidAt ?? null }
    }), [clients, byClient])

    const filtered = rows.filter((r) => {
        if (q.trim() && !r.c.name.toLowerCase().includes(q.toLowerCase())) return false
        if (filter === 'unpaid') return r.status !== 'full'
        if (filter === 'paid') return r.status === 'full'
        return true
    })

    const totalOwed = rows.reduce((s, r) => s + r.owed, 0)
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0)
    const totalRemaining = Math.max(0, totalOwed - totalPaid)
    const unpaidCount = rows.filter((r) => r.status !== 'full' && r.owed > 0).length

    const StatusBadge = ({ s }: { s: 'none' | 'partial' | 'full' }) => {
        const cfg = {
            none: { c: '#f87171', bg: 'rgba(248,113,113,0.10)', b: 'rgba(248,113,113,0.25)', Icon: AlertCircle, t: 'Chưa thu' },
            partial: { c: '#fbbf24', bg: 'rgba(245,158,11,0.10)', b: 'rgba(245,158,11,0.25)', Icon: Clock, t: 'Thu một phần' },
            full: { c: '#34d399', bg: 'rgba(16,185,129,0.10)', b: 'rgba(16,185,129,0.25)', Icon: CheckCircle2, t: 'Đã đủ' },
        }[s]
        const Icon = cfg.Icon
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: cfg.bg, border: `1px solid ${cfg.b}`, fontSize: 11, fontWeight: 600, color: cfg.c }}>
                <Icon style={{ width: 12, height: 12 }} /> {cfg.t}
            </span>
        )
    }

    const Summary = ({ label, value, color }: { label: string; value: string; color: string }) => (
        <div style={{ flex: 1, minWidth: 130, padding: '12px 16px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>{value}</div>
        </div>
    )

    return (
        <div style={{ padding: '16px 20px 40px' }}>
            {/* Month summary */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                <Summary label="Tổng cần thu" value={usd(totalOwed)} color="#fff" />
                <Summary label="Đã thu" value={usd(totalPaid)} color="#34d399" />
                <Summary label="Còn lại" value={usd(totalRemaining)} color={totalRemaining > 0 ? '#fbbf24' : '#34d399'} />
                <Summary label="Khách chưa thu đủ" value={String(unpaidCount)} color={unpaidCount > 0 ? '#f87171' : '#34d399'} />
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                    <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: '#52525b' }} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khách hàng..."
                        style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 10, background: 'rgba(39,39,42,0.6)', border: '1px solid rgba(255,255,255,0.06)', color: '#fff', fontSize: 13, outline: 'none' }} />
                </div>
                {([['all', 'Tất cả'], ['unpaid', 'Chưa thu đủ'], ['paid', 'Đã đủ']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setFilter(k)}
                        style={{ padding: '7px 13px', borderRadius: 9999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            background: filter === k ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${filter === k ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                            color: filter === k ? '#c4b5fd' : '#a1a1aa' }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {['Khách hàng', 'Cần thu', 'Đã thu', 'Còn lại', 'Trạng thái', ''].map((h, i) => (
                    <span key={i} style={{ fontSize: 10, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</span>
                ))}
            </div>

            {/* Rows */}
            {filtered.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', color: '#52525b', fontSize: 13 }}>Không có khách hàng nào.</div>
            ) : filtered.map((r) => (
                <div key={r.c.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.c.name}</div>
                        {r.lastPaidAt && <div style={{ fontSize: 10.5, color: '#52525b', marginTop: 1 }}>Thu gần nhất: {fmtDate(r.lastPaidAt)}</div>}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: '#d4d4d8', fontFamily: 'ui-monospace, monospace' }}>{usd(r.owed)}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: r.paid > 0 ? '#34d399' : '#52525b', fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}>{usd(r.paid)}</div>
                    <div style={{ textAlign: 'right', fontSize: 13, color: r.remaining > 0 ? '#fbbf24' : '#52525b', fontFamily: 'ui-monospace, monospace' }}>{usd(r.remaining)}</div>
                    <div><StatusBadge s={r.status} /></div>
                    <div style={{ textAlign: 'right' }}>
                        <button onClick={() => onRecord(r.c.id, r.owed, r.paid)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, cursor: 'pointer',
                                background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#c4b5fd', fontSize: 12, fontWeight: 600 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.22)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}>
                            <Plus style={{ width: 13, height: 13 }} /> Ghi nhận
                        </button>
                    </div>
                </div>
            ))}

            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#52525b' }}>
                <Wallet style={{ width: 13, height: 13 }} /> "Cần thu" = tổng giá trị task của khách trong tháng này. Một khách có thể ghi nhận nhiều lần (trả góp/một phần).
            </div>
        </div>
    )
}
