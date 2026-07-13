'use client'
// [Giao diện 2 · Mission Control · M13 Tạo hóa đơn] Full-bleed invoice creator = vỏ MC mỏng bọc
// InvoiceModal (embedded) — CHÍNH LÀ layout M13 (trái: task picker + thuế/trả trước/hồ sơ TT · phải:
// live preview giấy). InvoiceModal tự hydrate task chưa xuất + billing profiles + giá qua server action
// (getUnbilledTasks/getBillingProfiles) nên chỉ cần bơm {clientId, clientName, depositBalance, workspaceId}.
// InvoiceModal cần 1 clientId → nếu chưa chọn (vào thẳng /mc/hoa-don) hiện picker; vào qua ?clientId=X
// (nút "Tạo hóa đơn ▸ Màn 13" của CRM) thì mở thẳng. Đóng → về /mc/crm. Money admin-only (route đã cổng).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Search, FileText, ChevronRight } from 'lucide-react'
import { InvoiceModal } from '@/components/invoice/InvoiceModal'

export type McInvoiceClient = { id: number; name: string; depositBalance: number; parentName?: string }

const FONT = '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif'

function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?'
}

export default function McInvoiceBoard({
    clients,
    workspaceId,
    initialClientId,
}: {
    clients: McInvoiceClient[]
    workspaceId: string
    initialClientId?: number | null
}) {
    const router = useRouter()
    const [selectedId, setSelectedId] = useState<number | null>(initialClientId ?? null)
    const [q, setQ] = useState('')

    const selected = useMemo(() => clients.find((c) => c.id === selectedId) ?? null, [clients, selectedId])
    const back = () => router.push(`/${workspaceId}/mc/crm`)

    const filtered = useMemo(() => {
        const s = q.trim().toLowerCase()
        if (!s) return clients
        return clients.filter((c) => c.name.toLowerCase().includes(s) || (c.parentName?.toLowerCase().includes(s) ?? false))
    }, [clients, q])

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', flexDirection: 'column', position: 'relative', fontFamily: FONT }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Top bar */}
            <div style={{ position: 'relative', height: 56, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(10,10,10,0.60)', backdropFilter: 'blur(10px)' }}>
                <button
                    onClick={back}
                    title="Về Quản lý khách hàng"
                    style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#D4D4D8', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.10)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                >
                    <ArrowLeft style={{ width: 16, height: 16 }} />
                </button>
                <div style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText style={{ width: 17, height: 17, color: '#C4B5FD' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', color: '#FFFFFF' }}>Tạo hóa đơn</span>
                    <span style={{ fontSize: 11, color: '#A1A1AA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selected ? `Khách hàng: ${selected.name}` : 'Chọn khách hàng để lập hóa đơn từ task chưa xuất'}
                    </span>
                </div>
                <div style={{ flex: 1 }} />
                {selected && (
                    <button
                        onClick={() => { setSelectedId(null); setQ('') }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.30)', color: '#A5B4FC', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}
                    >
                        Đổi khách
                    </button>
                )}
            </div>

            {/* Body */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                {selected ? (
                    <InvoiceModal
                        embedded
                        isOpen
                        onClose={back}
                        clientId={selected.id}
                        clientName={selected.name}
                        depositBalance={selected.depositBalance}
                        workspaceId={workspaceId}
                    />
                ) : (
                    <div style={{ height: '100%', overflowY: 'auto', padding: '30px 24px', display: 'flex', justifyContent: 'center' }}>
                        <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(39,39,42,0.60)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <Search style={{ width: 15, height: 15, color: '#71717A', flexShrink: 0 }} />
                                <input
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Tìm khách hàng…"
                                    autoFocus
                                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#F4F4F5', fontFamily: 'inherit', fontSize: 13 }}
                                />
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 16, background: 'rgba(24,24,27,0.50)', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                {filtered.length === 0 ? (
                                    <div style={{ padding: '32px 16px', textAlign: 'center', color: '#71717A', fontSize: 12.5 }}>
                                        Không tìm thấy khách hàng phù hợp.
                                    </div>
                                ) : (
                                    filtered.map((c, i) => (
                                        <button
                                            key={c.id}
                                            onClick={() => setSelectedId(c.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', width: '100%' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)' }}
                                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                                        >
                                            <span style={{ width: 32, height: 32, borderRadius: 999, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                                {initials(c.name)}
                                            </span>
                                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: '#F4F4F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                                                <span style={{ fontSize: 10.5, color: '#71717A' }}>
                                                    {c.parentName ? `Brand con · ${c.parentName}` : 'Khách hàng'}
                                                    {c.depositBalance > 0 ? ` · cọc $${c.depositBalance.toLocaleString('en-US')}` : ''}
                                                </span>
                                            </span>
                                            <ChevronRight style={{ width: 15, height: 15, color: '#52525B', flexShrink: 0 }} />
                                        </button>
                                    ))
                                )}
                            </div>
                            <span style={{ fontSize: 10.5, color: '#52525B', textAlign: 'center' }}>
                                Hóa đơn gộp mọi task <b style={{ color: '#71717A' }}>chưa xuất</b> của khách (kể cả brand con) · xuất PDF &amp; lưu vào hệ thống.
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
