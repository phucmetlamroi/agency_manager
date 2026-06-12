'use client'

/**
 * [Canonical Clients] Share-link manager modal — replaces the old
 * "Mời vào Portal" account-invite flow in the Clients Manager.
 *
 * Server-side authz is the real boundary (share-link-actions gates every
 * call by canManageShareLinks = profile OWNER/ADMIN); a USER-role staff
 * member opening this modal just sees the server's refusal message.
 *
 * UX notes:
 *   - The raw URL is shown EXACTLY ONCE after creation (only its hash is
 *     stored) — the UI says so loudly and offers copy-to-clipboard.
 *   - Revoke is immediate (every public request re-resolves the token).
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Link2, Copy, Ban, Loader2, X, Plus, Eye } from 'lucide-react'
import {
    createClientShareLink,
    revokeClientShareLink,
    listClientShareLinks,
} from '@/actions/share-link-actions'

interface LinkRow {
    id: string
    createdAt: string
    revokedAt: string | null
    expiresAt: string | null
    lastAccessedAt: string | null
    accessCount: number
    createdByName: string
}

const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

export default function ShareLinkSection({ clientId, clientName, workspaceId, onClose }: {
    clientId: number
    clientName: string
    workspaceId: string
    onClose: () => void
}) {
    const [links, setLinks] = useState<LinkRow[] | null>(null)
    const [loadErr, setLoadErr] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    /** Raw URL of a just-created link — shown once, never recoverable. */
    const [freshUrl, setFreshUrl] = useState<string | null>(null)

    const reload = async () => {
        const res = await listClientShareLinks(clientId, workspaceId)
        if (res.success) { setLinks(res.links); setLoadErr(null) }
        else { setLinks([]); setLoadErr(res.error ?? 'Lỗi tải danh sách link.') }
    }

    useEffect(() => { void reload() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [clientId])

    const create = async () => {
        if (busy) return
        setBusy(true)
        const res = await createClientShareLink(clientId, workspaceId)
        setBusy(false)
        if (!res.success) { toast.error(res.error); return }
        setFreshUrl(res.url)
        void reload()
    }

    const copyFresh = async () => {
        if (!freshUrl) return
        try {
            await navigator.clipboard.writeText(freshUrl)
            toast.success('Đã copy link vào clipboard.')
        } catch {
            toast.error('Không copy được — hãy bôi đen link và copy thủ công.')
        }
    }

    const revoke = async (linkId: string) => {
        if (!confirm('Thu hồi link này? Khách sẽ KHÔNG mở được nữa (hiệu lực ngay lập tức).')) return
        const res = await revokeClientShareLink(linkId, workspaceId)
        if (!res.success) { toast.error(res.error); return }
        toast.success('Đã thu hồi link.')
        void reload()
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: 560, maxWidth: '94vw', maxHeight: '86vh', overflowY: 'auto', background: '#0A0A0A', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 18, padding: 20, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Link2 className="w-4 h-4" style={{ color: '#c4b5fd' }} /> Link chia sẻ — {clientName}
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#71717a' }}><X className="w-4 h-4" /></button>
                </div>
                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#a1a1aa', lineHeight: 1.55 }}>
                    Gửi link công khai cho khách — họ bấm vào là xem được <b>toàn bộ tiến độ & lịch sử</b> (mọi workspace),
                    có thể <b>duyệt</b>, <b>yêu cầu sửa</b> và <b>đánh giá</b> mà <b>không cần tài khoản</b>.
                    Mọi thao tác của khách đều báo về cho admin/editor.
                </p>

                {/* Freshly-created link — shown ONCE */}
                {freshUrl && (
                    <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#6ee7b7', marginBottom: 6 }}>
                            ⚠ LƯU LẠI NGAY — link chỉ hiển thị 1 lần duy nhất (hệ thống không lưu bản gốc):
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <code style={{ flex: 1, fontSize: 11.5, color: '#d1fae5', wordBreak: 'break-all', background: 'rgba(0,0,0,0.35)', padding: '8px 10px', borderRadius: 8 }}>{freshUrl}</code>
                            <button onClick={copyFresh} title="Copy" style={{ flexShrink: 0, padding: 8, borderRadius: 8, background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.35)', color: '#6ee7b7', cursor: 'pointer' }}>
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                <button
                    onClick={create}
                    disabled={busy}
                    style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#8B5CF6', border: 'none', color: '#fff', cursor: busy ? 'wait' : 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 700, opacity: busy ? 0.6 : 1, marginBottom: 16 }}
                >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Tạo link chia sẻ mới
                </button>

                {/* Existing links */}
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#71717a', marginBottom: 8 }}>Links đã tạo</div>
                {links === null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a1a1aa', fontSize: 13, padding: '10px 0' }}>
                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
                    </div>
                ) : loadErr ? (
                    <p style={{ fontSize: 13, color: '#f87171', margin: 0 }}>{loadErr}</p>
                ) : links.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#71717a', margin: 0 }}>Chưa có link nào cho khách này.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {links.map((l) => {
                            const dead = !!l.revokedAt || (l.expiresAt ? new Date(l.expiresAt).getTime() < Date.now() : false)
                            return (
                                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.03)', border: `1px solid ${dead ? 'rgba(255,255,255,0.06)' : 'rgba(139,92,246,0.22)'}`, opacity: dead ? 0.55 : 1 }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: dead ? '#71717a' : '#e4e4e7' }}>
                                            {dead ? '🚫 Đã thu hồi' : '🟢 Đang hoạt động'} · tạo {fmtDate(l.createdAt)} bởi {l.createdByName}
                                        </div>
                                        <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 2, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <Eye className="w-3 h-3" /> {l.accessCount} lượt mở · lần cuối {fmtDate(l.lastAccessedAt)}
                                        </div>
                                    </div>
                                    {!dead && (
                                        <button onClick={() => revoke(l.id)} title="Thu hồi link" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>
                                            <Ban className="w-3.5 h-3.5" /> Thu hồi
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
