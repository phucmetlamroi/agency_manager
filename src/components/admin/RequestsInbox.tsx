'use client'

/**
 * [Client Task Submission v2] Admin "Hộp thư yêu cầu" — one card per client
 * request. Accept → spawns a Task into the queue (acceptClientRequest); Reject →
 * marks REJECTED with an optional note. Dark admin skin (matches the queue page).
 *
 * P3 will add a "Quét bằng Velox" entry that opens the seeded AddTaskModal; for
 * now "Tạo task" is a one-click accept.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ExternalLink, Check, X, Loader2, Clock, Film, CalendarClock, ListChecks } from 'lucide-react'
import { acceptClientRequest, rejectClientRequest, type ClientRequestDTO } from '@/actions/client-request-actions'

function fmt(iso: string) {
    try {
        return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso))
    } catch { return iso }
}

const LINK_DEFS: { key: keyof ClientRequestDTO; label: string }[] = [
    { key: 'rawFootage', label: 'Raw' },
    { key: 'collectFile', label: 'Collect' },
    { key: 'bRoll', label: 'B-roll' },
    { key: 'refs', label: 'References' },
    { key: 'submitFolder', label: 'Submission' },
    { key: 'script', label: 'Script' },
]

export default function RequestsInbox({ workspaceId, initialRequests }: {
    workspaceId: string
    initialRequests: ClientRequestDTO[]
}) {
    const router = useRouter()
    const [requests, setRequests] = useState<ClientRequestDTO[]>(initialRequests)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [rejectNote, setRejectNote] = useState('')
    const [errById, setErrById] = useState<Record<string, string>>({})

    const setErr = (id: string, msg: string | null) =>
        setErrById((m) => { const n = { ...m }; if (msg) n[id] = msg; else delete n[id]; return n })

    const accept = async (id: string) => {
        setBusyId(id); setErr(id, null)
        const res = await acceptClientRequest(id, workspaceId)
        setBusyId(null)
        if (res?.success) setRequests((prev) => prev.filter((r) => r.id !== id))
        else setErr(id, res?.error || 'Không tạo được task.')
    }

    const reject = async (id: string) => {
        setBusyId(id); setErr(id, null)
        const res = await rejectClientRequest(id, workspaceId, rejectNote.trim() || undefined)
        setBusyId(null)
        if (res?.success) {
            setRequests((prev) => prev.filter((r) => r.id !== id))
            setRejectingId(null); setRejectNote('')
        } else setErr(id, res?.error || 'Không từ chối được yêu cầu.')
    }

    if (requests.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center"
                style={{ borderRadius: 20, background: 'hsl(var(--surface-1))', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="relative">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/25 to-violet-500/10 blur-2xl absolute inset-0" />
                    <div className="relative w-24 h-24 rounded-full flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(99,102,241,0.06))', border: '1px solid rgba(99,102,241,0.25)' }}>
                        <Sparkles className="w-7 h-7 text-primary-accent" />
                    </div>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-zinc-100">Chưa có yêu cầu nào</h3>
                    <p className="text-muted-foreground text-sm max-w-xs mt-1">Khi khách hàng gửi yêu cầu qua portal, nó sẽ xuất hiện ở đây để bạn duyệt.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {requests.map((r) => {
                const links = LINK_DEFS.map((d) => ({ label: d.label, url: (r[d.key] as string | null) || '' })).filter((l) => l.url)
                const videoCount = r.videoList ? r.videoList.split('\n').map((s) => s.trim()).filter(Boolean).length : 0
                const busy = busyId === r.id
                return (
                    <div key={r.id} style={{ borderRadius: 18, background: 'hsl(var(--surface-1))', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 16px 40px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
                        {/* Card header */}
                        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-white" style={{ fontSize: 15 }}>{r.title}</span>
                                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', color: '#A5B4FC', background: 'rgba(99,102,241,0.14)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 999, padding: '2px 8px' }}>MỚI</span>
                                    </div>
                                    <div className="text-muted-foreground mt-1" style={{ fontSize: 12.5 }}>{r.clientName ?? 'Khách hàng'}</div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0 text-muted-foreground" style={{ fontSize: 11.5 }}>
                                    <Clock className="w-3.5 h-3.5" /> {fmt(r.createdAt)}
                                </div>
                            </div>

                            {/* Meta chips */}
                            <div className="flex items-center gap-2 flex-wrap mt-3">
                                {r.desiredType && <Chip icon={<Film className="w-3 h-3" />} text={r.desiredType} />}
                                {videoCount > 0 && <Chip icon={<ListChecks className="w-3 h-3" />} text={`${videoCount} video`} />}
                                {r.desiredDeadline && <Chip icon={<CalendarClock className="w-3 h-3" />} text={fmt(r.desiredDeadline)} />}
                            </div>
                        </div>

                        {/* Card body */}
                        <div style={{ padding: '14px 18px' }}>
                            {links.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    {links.map((l) => (
                                        <a key={l.label} href={l.url} target="_blank" rel="noreferrer"
                                            className="inline-flex items-center gap-1.5"
                                            style={{ fontSize: 12, fontWeight: 600, color: '#C7D2FE', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 9px' }}>
                                            {l.label} <ExternalLink className="w-3 h-3 opacity-70" />
                                        </a>
                                    ))}
                                </div>
                            )}
                            {r.notes && (
                                <div className="mt-3 whitespace-pre-wrap" style={{ fontSize: 13, color: '#D4D4D8', lineHeight: 1.55, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px' }}>
                                    {r.notes}
                                </div>
                            )}
                            {r.videoList && (
                                <div className="mt-2 whitespace-pre-wrap" style={{ fontSize: 12.5, color: '#A1A1AA', lineHeight: 1.5 }}>
                                    {r.videoList}
                                </div>
                            )}

                            {errById[r.id] && <div className="mt-3" style={{ fontSize: 12.5, color: '#FCA5A5', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '7px 10px' }}>{errById[r.id]}</div>}

                            {/* Reject note input */}
                            {rejectingId === r.id ? (
                                <div className="mt-3">
                                    <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={2}
                                        placeholder="Lý do từ chối (không bắt buộc)…"
                                        className="w-full outline-none"
                                        style={{ fontSize: 13, color: '#E4E4E7', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10, padding: '9px 11px', resize: 'vertical', fontFamily: 'inherit' }} />
                                    <div className="flex items-center gap-2 mt-2">
                                        <button disabled={busy} onClick={() => reject(r.id)}
                                            className="inline-flex items-center gap-1.5"
                                            style={{ fontSize: 12.5, fontWeight: 700, color: '#FCA5A5', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>
                                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Xác nhận từ chối
                                        </button>
                                        <button disabled={busy} onClick={() => { setRejectingId(null); setRejectNote('') }}
                                            style={{ fontSize: 12.5, fontWeight: 600, color: '#A1A1AA', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '7px 12px', cursor: 'pointer' }}>
                                            Hủy
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 mt-4">
                                    <button disabled={busy} onClick={() => accept(r.id)}
                                        className="inline-flex items-center gap-2"
                                        style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF', background: 'hsl(var(--primary))', border: '1px solid #6366F1', borderRadius: 10, padding: '9px 16px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Tạo task
                                    </button>
                                    {r.rawFootage && (
                                        <button disabled={busy} onClick={() => router.push(`/${workspaceId}/admin?veloxRequest=${r.id}&folder=${encodeURIComponent(r.rawFootage || '')}${r.clientId != null ? `&clientId=${r.clientId}` : ''}`)}
                                            className="inline-flex items-center gap-1.5"
                                            style={{ fontSize: 13, fontWeight: 600, color: '#C7D2FE', background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.30)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>
                                            <Sparkles className="w-3.5 h-3.5" /> Quét bằng Velox
                                        </button>
                                    )}
                                    <button disabled={busy} onClick={() => { setRejectingId(r.id); setRejectNote(''); setErr(r.id, null) }}
                                        className="inline-flex items-center gap-1.5"
                                        style={{ fontSize: 13, fontWeight: 600, color: '#A1A1AA', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '9px 14px', cursor: 'pointer' }}>
                                        <X className="w-3.5 h-3.5" /> Từ chối
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function Chip({ icon, text }: { icon: React.ReactNode; text: string }) {
    return (
        <span className="inline-flex items-center gap-1.5" style={{ fontSize: 11.5, fontWeight: 600, color: '#A1A1AA', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 999, padding: '4px 10px' }}>
            {icon} {text}
        </span>
    )
}
