'use client'

/**
 * [Trial P1/P3] Reusable ClickUp-style comment + activity feed. Skin-aware:
 *   - 'dark'  → admin task drawer (zinc/violet)
 *   - 'light' → client portal (Daylight Atelier CSS vars)
 * Staff get the INTERNAL 🔒 visibility toggle; the client never does. @mentions
 * are highlighted; activity events (from AuditLog) are interleaved as muted rows.
 * P3: reply threads (indented under their parent) + emoji reactions.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Loader2, Lock, Pencil, Trash2, Check, X, CornerDownRight, SmilePlus } from 'lucide-react'
import { COMMENT_REACTIONS } from '@/lib/comment-reactions'

export interface ThreadReaction { emoji: string; count: number; mine: boolean }

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
    parentId?: string | null
    reactions?: ThreadReaction[]
    isMine?: boolean
    canManage?: boolean
}

type Result = { success?: boolean; error?: string }

export default function TaskCommentThread({
    items, skin, canInternalToggle, loading,
    onPost, onEdit, onDelete, onReact, onRefresh,
}: {
    items: ThreadItem[]
    skin: 'dark' | 'light'
    canInternalToggle: boolean
    loading?: boolean
    onPost: (body: string, visibility: 'INTERNAL' | 'CLIENT', parentId?: string | null) => Promise<Result>
    onEdit?: (id: string, body: string) => Promise<Result>
    onDelete?: (id: string) => Promise<Result>
    onReact?: (id: string, emoji: string) => Promise<Result>
    onRefresh: () => void
}) {
    const dark = skin === 'dark'
    const [body, setBody] = useState('')
    const [internal, setInternal] = useState(false)
    const [busy, setBusy] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editBody, setEditBody] = useState('')
    const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null)
    const [pickerFor, setPickerFor] = useState<string | null>(null)
    const scrollRef = useRef<HTMLDivElement>(null)
    const composerRef = useRef<HTMLTextAreaElement>(null)

    // Keep the feed pinned to the latest message.
    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [items.length])

    const c = useMemo(() => dark ? {
        text: '#E4E4E7', muted: '#A1A1AA', faint: '#71717A', line: 'rgba(255,255,255,0.08)',
        bubble: 'rgba(255,255,255,0.03)', bubbleLine: 'rgba(255,255,255,0.07)',
        internalBg: 'rgba(234,179,8,0.08)', internalLine: 'rgba(234,179,8,0.25)', internalText: '#FDE68A',
        accent: '#8B5CF6', accentSoft: 'rgba(139,92,246,0.14)', accentLine: 'rgba(139,92,246,0.4)',
        mention: '#C4B5FD', inputBg: 'rgba(255,255,255,0.04)', inputLine: 'rgba(255,255,255,0.10)',
        chip: 'rgba(255,255,255,0.05)', chipLine: 'rgba(255,255,255,0.09)',
        err: '#FCA5A5', errBg: 'rgba(239,68,68,0.08)', errLine: 'rgba(239,68,68,0.2)',
        pop: '#18181B', popLine: 'rgba(255,255,255,0.12)',
    } : {
        text: 'var(--fg-1)', muted: 'var(--fg-2)', faint: 'var(--fg-3)', line: 'var(--line)',
        bubble: 'var(--surface-2)', bubbleLine: 'var(--line-2)',
        internalBg: 'var(--accent-soft)', internalLine: 'var(--accent-line)', internalText: 'var(--accent-fg)',
        accent: 'var(--accent)', accentSoft: 'var(--accent-soft)', accentLine: 'var(--accent-line)',
        mention: 'var(--accent-fg)', inputBg: 'var(--surface-2)', inputLine: 'var(--line-2)',
        chip: 'var(--surface-2)', chipLine: 'var(--line-2)',
        err: 'var(--danger, #C2562F)', errBg: 'var(--accent-soft)', errLine: 'var(--accent-line)',
        pop: 'var(--surface)', popLine: 'var(--line-2)',
    }, [dark])

    // Admin (dark) = Vietnamese staff UI; client portal (light) = English.
    const L = dark ? {
        header: 'Bình luận & hoạt động', empty: 'Chưa có bình luận. Bắt đầu trao đổi về task này.',
        placeholder: canInternalToggle ? 'Viết bình luận…  @tên để nhắc' : 'Viết bình luận…',
        edited: 'đã sửa', reply: 'Trả lời', replyingTo: 'Đang trả lời', cancel: 'Huỷ', save: 'Lưu',
        editT: 'Sửa', delT: 'Xoá', internalTag: 'Nội bộ', publicTag: 'Công khai',
    } : {
        header: 'Comments & activity', empty: 'No comments yet — start the conversation.',
        placeholder: 'Write a comment…', edited: 'edited', reply: 'Reply', replyingTo: 'Replying to',
        cancel: 'Cancel', save: 'Save', editT: 'Edit', delT: 'Delete', internalTag: 'Internal', publicTag: 'Public',
    }

    const fmt = (iso: string) => {
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return iso }
    }

    const renderBody = (t: string) => {
        const parts = t.split(/(@[a-zA-Z0-9_.\-]+)/g)
        return parts.map((p, i) => p.startsWith('@')
            ? <span key={i} style={{ color: c.mention, fontWeight: 600 }}>{p}</span>
            : <span key={i}>{p}</span>)
    }

    // Group replies under their parent (top-level = events + comments without parentId).
    const { topLevel, repliesByParent } = useMemo(() => {
        const byParent = new Map<string, ThreadItem[]>()
        const knownIds = new Set(items.filter((i) => i.kind === 'comment').map((i) => i.id))
        const top: ThreadItem[] = []
        for (const it of items) {
            if (it.kind === 'comment' && it.parentId && knownIds.has(it.parentId)) {
                const arr = byParent.get(it.parentId) || []
                arr.push(it); byParent.set(it.parentId, arr)
            } else {
                top.push(it) // events, top-level comments, and orphaned replies (deleted parent)
            }
        }
        for (const arr of byParent.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        return { topLevel: top, repliesByParent: byParent }
    }, [items])

    const submit = async () => {
        const v = body.trim()
        if (!v || busy) return
        setBusy(true); setErr(null)
        const res = await onPost(v, internal ? 'INTERNAL' : 'CLIENT', replyTo?.id ?? null)
        setBusy(false)
        if (res?.success) { setBody(''); setInternal(false); setReplyTo(null); onRefresh() }
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

    const react = async (id: string, emoji: string) => {
        if (!onReact) return
        setPickerFor(null)
        const res = await onReact(id, emoji)
        if (res?.success) onRefresh()
        else if (res?.error) setErr(res.error)
    }

    const startReply = (it: ThreadItem) => {
        setReplyTo({ id: it.id, name: it.authorName })
        setTimeout(() => composerRef.current?.focus(), 0)
    }

    const renderComment = (it: ThreadItem, isReply: boolean) => (
        <div key={it.id} style={{ marginLeft: isReply ? 20 : 0, paddingLeft: isReply ? 10 : 0, borderLeft: isReply ? `2px solid ${c.line}` : 'none' }}>
            <div style={{ borderRadius: 12, padding: '9px 11px', background: it.visibility === 'INTERNAL' ? c.internalBg : c.bubble, border: `1px solid ${it.visibility === 'INTERNAL' ? c.internalLine : c.bubbleLine}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: c.text }}>{it.authorName}</span>
                    {it.visibility === 'INTERNAL' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: c.internalText, background: c.internalBg, border: `1px solid ${c.internalLine}`, borderRadius: 999, padding: '1px 6px' }}>
                            <Lock size={9} /> {L.internalTag}
                        </span>
                    )}
                    <span style={{ fontSize: 11, color: c.faint }}>{fmt(it.createdAt)}{it.editedAt ? ` · ${L.edited}` : ''}</span>
                    {it.canManage && editingId !== it.id && (
                        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                            {it.isMine && onEdit && (
                                <button title={L.editT} onClick={() => { setEditingId(it.id); setEditBody(it.body || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.faint, padding: 0, display: 'inline-flex' }}><Pencil size={13} /></button>
                            )}
                            {onDelete && (
                                <button title={L.delT} onClick={() => del(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.faint, padding: 0, display: 'inline-flex' }}><Trash2 size={13} /></button>
                            )}
                        </span>
                    )}
                </div>
                {editingId === it.id ? (
                    <div>
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={2} autoFocus
                            style={{ width: '100%', fontSize: 13, color: c.text, background: c.inputBg, border: `1px solid ${c.inputLine}`, borderRadius: 8, padding: '7px 9px', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
                        <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                            <button disabled={busy} onClick={() => saveEdit(it.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#fff', background: c.accent, border: 'none', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}><Check size={12} /> {L.save}</button>
                            <button disabled={busy} onClick={() => setEditingId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: c.muted, background: 'none', border: `1px solid ${c.inputLine}`, borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}><X size={12} /> {L.cancel}</button>
                        </div>
                    </div>
                ) : (
                    <div style={{ fontSize: 13, color: c.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderBody(it.body || '')}</div>
                )}
            </div>

            {/* Reactions + reply row */}
            {editingId !== it.id && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5, marginLeft: 2, position: 'relative' }}>
                    {(it.reactions || []).map((r) => (
                        <button key={r.emoji} onClick={() => react(it.id, r.emoji)} disabled={!onReact}
                            title={r.mine ? 'Bỏ thả cảm xúc' : 'Thả cảm xúc'}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, lineHeight: 1, cursor: onReact ? 'pointer' : 'default', borderRadius: 999, padding: '3px 8px', border: `1px solid ${r.mine ? c.accentLine : c.chipLine}`, background: r.mine ? c.accentSoft : c.chip, color: c.text }}>
                            <span>{r.emoji}</span><span style={{ fontSize: 11, color: c.muted }}>{r.count}</span>
                        </button>
                    ))}
                    {onReact && (
                        <button onClick={() => setPickerFor(pickerFor === it.id ? null : it.id)} title="Thêm cảm xúc"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 22, cursor: 'pointer', borderRadius: 999, border: `1px solid ${c.chipLine}`, background: 'transparent', color: c.faint }}>
                            <SmilePlus size={13} />
                        </button>
                    )}
                    {!isReply && it.visibility !== 'INTERNAL' && (
                        <button onClick={() => startReply(it)} title={L.reply}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', background: 'none', border: 'none', color: c.faint, padding: '2px 4px' }}>
                            <CornerDownRight size={12} /> {L.reply}
                        </button>
                    )}
                    {pickerFor === it.id && onReact && (
                        <div style={{ position: 'absolute', top: 26, left: 0, zIndex: 20, display: 'flex', gap: 2, padding: 5, borderRadius: 10, background: c.pop, border: `1px solid ${c.popLine}`, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                            {COMMENT_REACTIONS.map((e) => (
                                <button key={e} onClick={() => react(it.id, e)} style={{ fontSize: 16, lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: '3px 4px', borderRadius: 6 }}>{e}</button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Replies */}
            {repliesByParent.get(it.id)?.map((r) => renderComment(r, true))}
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', color: c.muted, flexShrink: 0 }}>
                {L.header}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: c.faint }}><Loader2 className="animate-spin" size={18} /></div>
                ) : topLevel.length === 0 ? (
                    <div style={{ color: c.faint, fontSize: 13, textAlign: 'center', padding: '24px 8px' }}>{L.empty}</div>
                ) : topLevel.map((it) => it.kind === 'event' ? (
                    <div key={it.id} style={{ fontSize: 11.5, color: c.faint, display: 'flex', gap: 6, alignItems: 'baseline', paddingLeft: 2 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: c.faint, flexShrink: 0, marginTop: 5 }} />
                        <span><strong style={{ color: c.muted, fontWeight: 600 }}>{it.authorName}</strong> {it.label} · {fmt(it.createdAt)}</span>
                    </div>
                ) : renderComment(it, false))}
            </div>

            {/* Composer */}
            <div style={{ borderTop: `1px solid ${c.line}`, padding: 12, flexShrink: 0 }}>
                {err && <div style={{ fontSize: 12, color: c.err, background: c.errBg, border: `1px solid ${c.errLine}`, borderRadius: 8, padding: '6px 9px', marginBottom: 8 }}>{err}</div>}
                {replyTo && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: c.muted, marginBottom: 6, padding: '4px 8px', background: c.accentSoft, border: `1px solid ${c.accentLine}`, borderRadius: 8 }}>
                        <CornerDownRight size={12} /> {L.replyingTo} <strong style={{ color: c.text }}>{replyTo.name}</strong>
                        <button onClick={() => setReplyTo(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: c.faint, display: 'inline-flex' }}><X size={13} /></button>
                    </div>
                )}
                <textarea
                    ref={composerRef}
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
                            <Lock size={12} /> {internal ? L.internalTag : L.publicTag}
                        </button>
                    )}
                    <button
                        disabled={!body.trim() || busy}
                        onClick={submit}
                        style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#fff', background: c.accent, border: 'none', borderRadius: 9, padding: '8px 15px', cursor: body.trim() && !busy ? 'pointer' : 'not-allowed', opacity: body.trim() && !busy ? 1 : 0.55 }}
                    >
                        {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} {dark ? 'Gửi' : 'Send'}
                    </button>
                </div>
            </div>
        </div>
    )
}
