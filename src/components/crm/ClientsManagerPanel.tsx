'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Building2, ChevronRight, ArrowLeft, Loader2, UserPlus, X } from 'lucide-react'
import ClientList from './ClientList'
import ClientAnalytics from './ClientAnalytics'
import CreateClientButton from './CreateClientButton'
import { InvoiceModal } from '@/components/invoice/InvoiceModal'
import { getClientDetail } from '@/actions/crm-actions'
import { inviteClientToProfile } from '@/actions/member-actions'

type View = 'list' | 'detail' | 'invoice'

const FONT = "'Plus Jakarta Sans', sans-serif"

/** Tìm tên + deposit của 1 khách (kể cả brand con) trong cây danh sách. */
function findClient(clients: any[], id: number): any | null {
    for (const c of clients) {
        if (c.id === id) return c
        for (const s of c.subsidiaries || []) if (s.id === id) return s
    }
    return null
}

/**
 * Orchestrator gộp Clients Manager vào Dashboard: điều hướng in-place 3 cấp
 * (Danh sách → Chi tiết → Tạo hóa đơn) có breadcrumb, không rời Dashboard.
 * Tái dùng component thật (ClientList / ClientAnalytics / InvoiceModal) →
 * giữ nguyên 100% chức năng. Báo `onViewChange` để parent nở full-width.
 */
export default function ClientsManagerPanel({
    clients,
    workspaceId,
    onViewChange,
}: {
    clients: any[]
    workspaceId: string
    onViewChange?: (v: View) => void
}) {
    const [view, setView] = useState<View>('list')
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [detail, setDetail] = useState<{ client: any; distribution: any[]; ratings: any[] } | null>(null)
    const [loading, setLoading] = useState(false)
    const [inviteOpen, setInviteOpen] = useState(false)
    const [inviteName, setInviteName] = useState('')
    const [inviteBusy, setInviteBusy] = useState(false)

    useEffect(() => { onViewChange?.(view) }, [view, onViewChange])

    const doInvite = async () => {
        if (!inviteName.trim() || selectedId == null || inviteBusy) return
        setInviteBusy(true)
        const res = await inviteClientToProfile(workspaceId, inviteName.trim(), selectedId)
        setInviteBusy(false)
        if (!('username' in res)) { toast.error(res.error || 'Không mời được.'); return }
        toast.success(res.directAdd ? `Đã cấp quyền portal cho ${res.username}.` : `Đã gửi lời mời portal tới ${res.username}.`)
        setInviteOpen(false); setInviteName('')
    }

    const selectedClient = selectedId != null ? (detail?.client ?? findClient(clients, selectedId)) : null
    const selectedName = selectedClient?.name ?? ''

    const goList = () => { setView('list'); setSelectedId(null); setDetail(null) }

    const openClient = async (id: number) => {
        setSelectedId(id)
        setView('detail')
        setDetail(null)
        setLoading(true)
        const res = await getClientDetail(id, workspaceId)
        setLoading(false)
        if (res.success) {
            setDetail({ client: res.client, distribution: res.distribution, ratings: res.ratings })
        } else {
            toast.error(res.error || 'Không tải được chi tiết khách hàng.')
            goList()
        }
    }

    return (
        <div
            style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                borderRadius: 26,
                background: '#0A0A0A',
                border: '1px solid rgba(139,92,246,0.15)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
                overflow: 'hidden',
                fontFamily: FONT,
            }}
        >
            {/* ── Header / breadcrumb ── */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '14px 18px',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                    {view !== 'list' && (
                        <button
                            onClick={() => (view === 'invoice' ? setView('detail') : goList())}
                            title="Quay lại"
                            className="flex items-center justify-center flex-shrink-0 rounded-[10px] text-zinc-300 transition-all"
                            style={{ width: 34, height: 34, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}

                    <div className="flex items-center gap-2 min-w-0">
                        <div
                            className="flex items-center justify-center flex-shrink-0"
                            style={{ width: 34, height: 34, borderRadius: 11, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.28)' }}
                        >
                            <Building2 className="w-[17px] h-[17px]" style={{ color: '#c4b5fd' }} />
                        </div>
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <button
                                onClick={goList}
                                className="flex flex-col items-start min-w-0"
                                style={{ background: 'none', border: 'none', padding: 0, cursor: view === 'list' ? 'default' : 'pointer', fontFamily: 'inherit' }}
                            >
                                <span className="text-[18px] font-bold tracking-[-0.01em] truncate" style={{ color: view === 'list' ? '#fff' : '#a1a1aa', transition: 'color .2s' }}>
                                    Clients Manager
                                </span>
                                {view === 'list' && (
                                    <span className="text-xs font-normal" style={{ color: '#A1A1AA' }}>Quản lý Đối tác, Brand con &amp; Hiệu suất</span>
                                )}
                            </button>
                            {view !== 'list' && selectedName && (
                                <>
                                    <ChevronRight className="w-[15px] h-[15px] flex-shrink-0" style={{ color: '#52525b' }} />
                                    <button
                                        onClick={() => setView('detail')}
                                        className="text-[16px] font-extrabold truncate"
                                        style={{ background: 'none', border: 'none', padding: 0, cursor: view === 'invoice' ? 'pointer' : 'default', fontFamily: 'inherit', color: view === 'detail' ? '#fff' : '#a1a1aa', transition: 'color .2s', maxWidth: 220 }}
                                    >
                                        {selectedName}
                                    </button>
                                </>
                            )}
                            {view === 'invoice' && (
                                <>
                                    <ChevronRight className="w-[15px] h-[15px] flex-shrink-0" style={{ color: '#52525b' }} />
                                    <span className="text-[16px] font-extrabold text-white">Tạo hóa đơn</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                    {view === 'list' && (
                        <>
                            <span
                                className="inline-flex items-center gap-1.5"
                                style={{ padding: '5px 12px', borderRadius: 9999, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}
                            >
                                <span className="text-[15px] font-extrabold" style={{ color: '#c4b5fd' }}>{clients.length}</span>
                                <span className="text-[11px] font-semibold" style={{ color: '#a78bfa' }}>Clients</span>
                            </span>
                            <CreateClientButton partners={clients} workspaceId={workspaceId} />
                        </>
                    )}
                    {view === 'detail' && (
                        <button
                            onClick={() => setInviteOpen(true)}
                            className="inline-flex items-center gap-1.5"
                            style={{ padding: '6px 12px', borderRadius: 9, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}
                        >
                            <UserPlus className="w-[14px] h-[14px]" /> Mời vào Portal
                        </button>
                    )}
                    {view === 'invoice' && (
                        <span className="text-[11px] font-mono tracking-[0.06em]" style={{ color: '#71717a' }}>INVOICE BUILDER</span>
                    )}
                </div>
            </div>

            {/* ── Body (swap in-place) ── */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <motion.div
                    key={view + ':' + (selectedId ?? '')}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
                    style={{ height: '100%', overflow: view === 'invoice' ? 'hidden' : 'auto' }}
                    className={view === 'invoice' ? '' : 'custom-scrollbar'}
                >
                    {view === 'list' && (
                        <ClientList clients={clients} workspaceId={workspaceId} onOpenClient={openClient} />
                    )}

                    {view === 'detail' && (
                        loading || !detail ? (
                            <div className="flex items-center justify-center gap-2 h-full text-sm" style={{ color: '#A1A1AA' }}>
                                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải chi tiết…
                            </div>
                        ) : (
                            <div className="px-5 py-5">
                                <ClientAnalytics
                                    client={detail.client}
                                    distribution={detail.distribution}
                                    workspaceId={workspaceId}
                                    ratings={detail.ratings}
                                    onCreateInvoice={() => setView('invoice')}
                                />
                            </div>
                        )
                    )}

                    {view === 'invoice' && detail && (
                        <InvoiceModal
                            embedded
                            isOpen
                            onClose={() => setView('detail')}
                            clientId={detail.client.id}
                            clientName={detail.client.name}
                            depositBalance={Number(detail.client.depositBalance || 0)}
                            workspaceId={workspaceId}
                        />
                    )}
                </motion.div>
            </div>

            {inviteOpen && (
                <div onClick={() => setInviteOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                    <div onClick={(e) => e.stopPropagation()} style={{ width: 420, maxWidth: '94vw', background: '#0A0A0A', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 18, padding: 20, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff' }}>Mời khách vào Portal</h3>
                            <button onClick={() => setInviteOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a' }}><X className="w-4 h-4" /></button>
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#a1a1aa', lineHeight: 1.5 }}>
                            Nhập <b>tên đăng nhập</b> của tài khoản sẽ làm portal user cho <b style={{ color: '#c4b5fd' }}>{selectedName}</b>. Họ sẽ thấy profile này ở chế độ Client (chỉ xem) khi switch sang.
                        </p>
                        <input
                            autoFocus value={inviteName} onChange={(e) => setInviteName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void doInvite() }}
                            placeholder="username hoặc email"
                            style={{ width: '100%', height: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)', color: '#fff', padding: '0 12px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                            <button onClick={() => setInviteOpen(false)} style={{ padding: '8px 14px', borderRadius: 9, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#a1a1aa', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600 }}>Huỷ</button>
                            <button onClick={doInvite} disabled={!inviteName.trim() || inviteBusy} style={{ padding: '8px 16px', borderRadius: 9, background: '#8B5CF6', border: 'none', color: '#fff', cursor: (!inviteName.trim() || inviteBusy) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, opacity: (!inviteName.trim() || inviteBusy) ? 0.5 : 1 }}>{inviteBusy ? 'Đang gửi…' : 'Gửi lời mời'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
