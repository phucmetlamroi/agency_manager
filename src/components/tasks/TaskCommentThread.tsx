'use client'

/**
 * [Trial P1] Reusable ClickUp-style comment + activity feed. Skin-aware:
 *   - 'dark'  → admin task drawer (zinc/violet)
 *   - 'light' → client portal (Daylight Atelier CSS vars)
 * Staff get the INTERNAL 🔒 visibility toggle; the client never does. @mentions
 * are highlighted; activity events (from AuditLog) are interleaved as muted rows.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Loader2, Lock, Pencil, Trash2, Check, X } from 'lucide-react'

export interface ThreadItem {
    kind: 'comment' | 'event'
    id: string
    authorName: string
    authorType?: 'STAFF' | 'CLIENT'
    visibility?: 'INTERNAL' | 'CLIENT'
    body?: string
    label?: string
    createdAt: string
    editedAt?: string | null
    isMine?: boolean
    canManage?: boolean
}

type Result = { success?: boolean; error?: string }

export default function TaskCommentThread({
    items, skin, canInternalToggle, loading,
    onPost, onEdit, onDelete, onRefresh,
}: {
    items: ThreadItem[]
    skin: 'dark' | 'light'
    canInternalToggle: boolean
    loading?: boolean
    onPost: (body: string, visibility: 'INTERNAL' | 'CLIENT') => Promise<Result>
    onEdit?: (id: string, body: string) => Promise<Result>
    onDelete?: (id: string) => Promise<Result>
    onRefresh: () => void
}) {
    const dark = skin === 'dark'
    const [body, setBody] = useState('')
    const [internal, setInternal] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editBody, setEditBody] = useState('')
    const scrollRef = useRef<HTMLDivElement>(null)

    // Keep the feed pinned to the latest message.
    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [items.length])

    const c = useMemo(() => dark ? {
        text: '#E4E4E7', muted: '#A1A1AA', faint: '#71717A', line: 'rgba(255,255,255,0.08)',
        bubble: 'rgba(255,255,255,0.03)', bubbleLine: 'rgba(255,255,255,0.07)',
        internalBg: 'rgba(234,179,8,0.08)', internalLine: 'rgba(234,179,8,0.25)', internalText: '#FDE68A',
        accent: '#8B5CF6', mention: '#C4B5FD', inputBg: 'rgba(255,255,255,0.04)', inputLine: 'rgba(255,255,255,0.10)',
        err: '#FCA5A5', errBg: 'rgba(239,68,68,0.08)', errLine: 'rgba(239,68,68,0.2)',
    } : {
        text: 'var(--fg-1)', muted: 'var(--fg-2)', faint: 'var(--fg-3)', line: 'var(--line)',
        bubble: 'var(--surface-2)', bubbleLine: 'var(--line-2)',
        internalBg: 'var(--accent-soft)', internalLine: 'var(--accent-line)', internalText: 'var(--accent-fg)',
        accent: 'var(--accent)', mention: 'var(--accent-fg)', inputBg: 'var(--surface-2)', inputLine: 'var(--line-2)',
        err: 'var(--danger, #C2562F)', errBg: 'var(--accent-soft)', errLine: 'var(--accent-line)',
    }, [dark])

    // Admin (dark) = Vietnamese staff UI; client portal (light) = English.
    const L = dark ? {
        header: 'Bình luận & hoạt động', empty: 'Chưa có bình luận. Bắt đầu trao đổi về task này.',
        placeholder: canInternalToggle ? 'Viết bình luận…  @tên để nhắc' : 'Viết bình luận…',
        send: 'Gửi', edited: 'đã sửa',
    } : {
        header: 'Comments & activity', empty: 'No comments yet — start the conversation.',
        placeholder: 'Write a comment…', send: 'Send', edited: 'edited',
    }

    const fmt = (iso: string) => {
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return iso }
    }

    const renderBody = (t: string) => {
        // Highlight @mentions inline.
        const parts = t.split(/(@[a-zA-Z0-9_.\-]+)/g)
        return parts.map((p, i) => p.startsWith('@')
            ? <span key={i} style={{ color: c.mention, fontWeight: 600 }}>{p}</span>
            : <span key={i}>{p}</span>)
    }

    const submit = async () => {
        const v = body.trim()
        if (!v || busy) return
        setBusy(true); setErr(null)
        const res = await onPost(v, internal ? 'INTERNAL' : 'CLIENT')
        setBusy(false)
        if (res?.success) { setBody(''); setInternal(false); onRefresh() }
        else setErr(res?.error || 'Không gửi được.')
    }

    const saveEdit = async (id: string) => {
        const v = editBody.trim()
        if (!v || !onEdit) return
        setBusy(true)
        const res = await onEdit(id, v)
        setBusy(false)
        if (res?.success) { setEditingId(null); onRefresh() }
        else setErr(res?.error || 'Không sửa được.')
    }

    const del = async (id: string) => {
        if (!onDelete) return
        setBusy(true)
        const res = await onDelete(id)
        setBusy(false)
        if (res?.success) onRefresh()
        else setErr(res?.error || 'Không xoá được.')
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', color: c.muted, flexShrink: 0 }}>
                {L.header}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: c.faint }}><Loader2 className="animate-spin" size={18} /></div>
                ) : items.length === 0 ? (
                    <div style={{ color: c.faint, fontSize: 13, textAlign: 'center', padding: '24px 8px' }}>{L.empty}</div>
                ) : items.map((it) => it.kind === 'event' ? (
                    <div key={it.id} style={{ fontSize: 11.5, color: c.faint, display: 'flex', gap: 6, alignItems: 'baseline', paddingLeft: 2 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: c.faint, flexShrink: 0, marginTop: 5 }} />
                        <span><strong style={{ color: c.muted, fontWeight: 600 }}>{it.authorName}</strong> {it.label} · {fmt(it.createdAt)}</span>
                    </div>
                ) : (
                    <div key={it.id} style={{ borderRadius: 12, padding: '9px 11px', background: it.visibility === 'INTERNAL' ? c.internalBg : c.bubble, border: `1px solid ${it.visibility === 'INTERNAL' ? c.internalLine : c.bubbleLine}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: c.text }}>{it.authorName}</span>
                            {it.visibility === 'INTERNAL' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: c.internalText, background: c.internalBg, border: `1px solid ${c.internalLine}`, borderRadius: 999, padding: '1px 6px' }}>
                                    <Lock size={9} /> Nội bộ
                                </span>
                            )}
                            <span style={{ fontSize: 11, color: c.faint }}>{fmt(it.createdAt)}{it.editedAt ? ` · ${L.edited}` : ''}</span>
                            {it.canManage && editingId !== it.id && (
                                <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                                    {it.isMine && onEdit && (
                                        <button title="Sửa" onClick={() => { setEditingId(it.id); setEditBody(it.body || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.faint, padding: 0, display: 'inline-flex' }}><Pencil size={13} /></button>
                                    )}
                                    {onDelete && (
                                        <button title="Xoá" onClick={() => del(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.faint, padding: 0, display: 'inline-flex' }}><Trash2 size={13} /></button>
                                    )}
                                </span>
                            )}
                        </div>
                        {editingId === it.id ? (
                            <div>
                                <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} autoFocus
                                    style={{ width: '100%', fontSize: 13, color: c.text, background: c.inputBg, border: `1px solid ${c.inputLine}`, borderRadius: 8, padding: '7px 9px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                                    <button disabled={busy} onClick={() => saveEdit(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: c.accent, border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}><Check size={12} /> Lưu</button>
                                    <button disabled={busy} onClick={() => setEditingId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: c.muted, background: 'none', border: `1px solid ${c.inputLine}`, borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}><X size={12} /> Huỷ</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: 13, color: c.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderBody(it.body || '')}</div>
                        )}
                    </div>
                ))}
            </div>

            {/* Composer */}
            <div style={{ borderTop: `1px solid ${c.line}`, padding: 12, flexShrink: 0 }}>
                {err && <div style={{ fontSize: 12, color: c.err, background: c.errBg, border: `1px solid ${c.errLine}`, borderRadius: 8, padding: '6px 9px', marginBottom: 8 }}>{err}</div>}
                <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit() }}
                    rows={2}
                    placeholder={L.placeholder}
                    style={{ width: '100%', fontSize: 13, color: c.text, background: c.inputBg, border: `1px solid ${c.inputLine}`, borderRadius: 10, padding: '9px 11px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                    {canInternalToggle && (
                        <button
                            type="button"
                            onClick={() => setInternal((v) => !v)}
                            title="Ghi chú nội bộ — khách hàng không thấy"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 8, padding: '5px 9px', border: `1px solid ${internal ? c.internalLine : c.inputLine}`, background: internal ? c.internalBg : 'transparent', color: internal ? c.internalText : c.muted }}
                        >
                            <Lock size={12} /> {internal ? 'Nội bộ' : 'Công khai'}
                        </button>
                    )}
                    <button
                        disabled={!body.trim() || busy}
                        onClick={submit}
                        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff', background: c.accent, border: 'none', borderRadius: 9, padding: '8px 15px', cursor: body.trim() && !busy ? 'pointer' : 'not-allowed', opacity: body.trim() && !busy ? 1 : 0.55 }}
                    >
                        {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} Gửi
                    </button>
                </div>
            </div>
        </div>
    )
}
