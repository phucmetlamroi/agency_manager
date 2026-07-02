'use client'

/**
 * [Trial P1/P3 · Chat GĐ3] Reusable ClickUp-style comment + activity feed.
 * Skin-aware:
 *   - 'dark'  → admin task drawer (zinc/violet)
 *   - 'light' → client portal (Daylight Atelier CSS vars)
 * Staff get the INTERNAL 🔒 toggle, the @mention dropdown, and the C2
 * assign→resolve action-item controls; the client portal gets NONE of those
 * (the props are simply not passed), so isolation is enforced by omission.
 *
 * GĐ3 additions: limited-markdown rendering (renderCommentMarkdown), @mention
 * autocomplete, message-as-action-item badge + assign/resolve/reopen, initials
 * avatars and day dividers. Realtime + read-marker live in the column wrapper.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Loader2, Lock, Pencil, Trash2, Check, X, CornerDownRight, SmilePlus, UserPlus, CircleDot, CheckCircle2, RotateCcw } from 'lucide-react'
import { COMMENT_REACTIONS } from '@/lib/comment-reactions'
import { renderCommentMarkdown } from '@/lib/comment-markdown'

export interface ThreadReaction { emoji: string; count: number; mine: boolean }

/** Structural shape of a workspace member for the @mention / assignee dropdown. */
export interface MentionMember { id: string; username: string; nickname: string | null; avatarUrl: string | null }

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
    // [Chat GĐ3 · C2] action-item fields (populated for staff feed only)
    actionAssignedToId?: string | null
    actionAssignedToName?: string | null
    actionAssignedById?: string | null
    actionAssignedByName?: string | null
    actionAssignedAt?: string | null
    actionResolvedAt?: string | null
    actionResolvedById?: string | null
    actionResolvedByName?: string | null
}

type Result = { success?: boolean; error?: string }

export default function TaskCommentThread({
    items, skin, canInternalToggle, loading,
    onPost, onEdit, onDelete, onReact, onRefresh,
    canAssign, onSearchMembers, onAssign, onResolve, onReopen,
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
    // [Chat GĐ3] staff-only extras — omitted for the client portal.
    canAssign?: boolean
    onSearchMembers?: (q: string) => Promise<MentionMember[]>
    onAssign?: (id: string, assigneeUserId: string | null) => Promise<Result>
    onResolve?: (id: string) => Promise<Result>
    onReopen?: (id: string) => Promise<Result>
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

    // [B3] @mention autocomplete state (composer).
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionResults, setMentionResults] = useState<MentionMember[]>([])
    const [mentionIdx, setMentionIdx] = useState(0)

    // [C2] assignee picker popover state (per comment).
    const [assignFor, setAssignFor] = useState<string | null>(null)

    // Keep the feed pinned to the latest message.
    useEffect(() => {
        const el = scrollRef.current
        if (el) el.scrollTop = el.scrollHeight
    }, [items.length])

    // [B3] Debounced member lookup while an @token is being typed.
    useEffect(() => {
        if (mentionQuery == null || !onSearchMembers) { setMentionResults([]); return }
        let alive = true
        const t = setTimeout(async () => {
            try {
                const r = await onSearchMembers(mentionQuery)
                if (alive) { setMentionResults(r); setMentionIdx(0) }
            } catch { if (alive) setMentionResults([]) }
        }, 120)
        return () => { alive = false; clearTimeout(t) }
    }, [mentionQuery, onSearchMembers])

    const c = useMemo(() => dark ? {
        text: '#E4E4E7', muted: '#A1A1AA', faint: '#71717A', line: 'rgba(255,255,255,0.08)',
        bubble: 'rgba(255,255,255,0.03)', bubbleLine: 'rgba(255,255,255,0.07)',
        internalBg: 'rgba(234,179,8,0.08)', internalLine: 'rgba(234,179,8,0.25)', internalText: '#FDE68A',
        accent: '#8B5CF6', accentSoft: 'rgba(139,92,246,0.14)', accentLine: 'rgba(139,92,246,0.4)',
        mention: '#C4B5FD', inputBg: 'rgba(255,255,255,0.04)', inputLine: 'rgba(255,255,255,0.10)',
        chip: 'rgba(255,255,255,0.05)', chipLine: 'rgba(255,255,255,0.09)',
        err: '#FCA5A5', errBg: 'rgba(239,68,68,0.08)', errLine: 'rgba(239,68,68,0.2)',
        pop: '#18181B', popLine: 'rgba(255,255,255,0.12)',
        openBg: 'rgba(234,179,8,0.10)', openLine: 'rgba(234,179,8,0.30)', openText: '#FDE68A',
        doneBg: 'rgba(16,185,129,0.10)', doneLine: 'rgba(16,185,129,0.30)', doneText: '#6EE7B7',
    } : {
        text: 'var(--fg-1)', muted: 'var(--fg-2)', faint: 'var(--fg-3)', line: 'var(--line)',
        bubble: 'var(--surface-2)', bubbleLine: 'var(--line-2)',
        internalBg: 'var(--accent-soft)', internalLine: 'var(--accent-line)', internalText: 'var(--accent-fg)',
        accent: 'var(--accent)', accentSoft: 'var(--accent-soft)', accentLine: 'var(--accent-line)',
        mention: 'var(--accent-fg)', inputBg: 'var(--surface-2)', inputLine: 'var(--line-2)',
        chip: 'var(--surface-2)', chipLine: 'var(--line-2)',
        err: 'var(--danger, #C2562F)', errBg: 'var(--accent-soft)', errLine: 'var(--accent-line)',
        pop: 'var(--surface)', popLine: 'var(--line-2)',
        openBg: 'var(--accent-soft)', openLine: 'var(--accent-line)', openText: 'var(--accent-fg)',
        doneBg: 'var(--accent-soft)', doneLine: 'var(--accent-line)', doneText: 'var(--accent-fg)',
    }, [dark])

    // Admin (dark) = Vietnamese staff UI; client portal (light) = English.
    const L = dark ? {
        header: 'Bình luận & hoạt động', empty: 'Chưa có bình luận. Bắt đầu trao đổi về task này.',
        placeholder: canInternalToggle ? 'Viết bình luận…  @tên để nhắc' : 'Viết bình luận…',
        edited: 'đã sửa', reply: 'Trả lời', replyingTo: 'Đang trả lời', cancel: 'Huỷ', save: 'Lưu',
        editT: 'Sửa', delT: 'Xoá', internalTag: 'Nội bộ', publicTag: 'Công khai',
        assign: 'Giao việc', reassign: 'Đổi người', unassign: 'Bỏ giao', resolve: 'Đánh dấu xử lý', reopen: 'Mở lại',
        open: 'Đang mở', resolved: 'Đã xử lý', assignedTo: 'Giao cho', by: 'bởi',
        today: 'Hôm nay', yesterday: 'Hôm qua', noMembers: 'Không tìm thấy',
    } : {
        header: 'Comments & activity', empty: 'No comments yet — start the conversation.',
        placeholder: 'Write a comment…', edited: 'edited', reply: 'Reply', replyingTo: 'Replying to',
        cancel: 'Cancel', save: 'Save', editT: 'Edit', delT: 'Delete', internalTag: 'Internal', publicTag: 'Public',
        assign: 'Assign', reassign: 'Reassign', unassign: 'Unassign', resolve: 'Resolve', reopen: 'Reopen',
        open: 'Open', resolved: 'Resolved', assignedTo: 'Assigned to', by: 'by',
        today: 'Today', yesterday: 'Yesterday', noMembers: 'No match',
    }

    const fmt = (iso: string) => {
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return iso }
    }
    const timeOnly = (iso: string) => {
        try { return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return iso }
    }
    const dayKey = (iso: string) => {
        try { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return iso.slice(0, 10) }
    }
    const dayLabel = (iso: string) => {
        const k = dayKey(iso)
        const now = new Date()
        const todayK = dayKey(now.toISOString())
        const yK = dayKey(new Date(now.getTime() - 86400000).toISOString())
        if (k === todayK) return L.today
        if (k === yK) return L.yesterday
        try { return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(iso)) }
        catch { return k }
    }

    const initials = (name: string) => (name || '?').trim().split(/\s+/).slice(-2).map((w) => w[0] || '').join('').toUpperCase().slice(0, 2) || '?'
    const AVATAR_HUES = [265, 200, 150, 25, 330, 95]
    const avatarHue = (name: string) => {
        let h = 0
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
        return AVATAR_HUES[h % AVATAR_HUES.length]
    }
    const Avatar = ({ name }: { name: string }) => {
        const hue = avatarHue(name)
        return (
            <span style={{
                width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10.5, fontWeight: 800, letterSpacing: '0.02em',
                color: dark ? `hsl(${hue} 70% 82%)` : `hsl(${hue} 45% 32%)`,
                background: dark ? `hsl(${hue} 45% 22% / 0.7)` : `hsl(${hue} 55% 92%)`,
                border: `1px solid ${dark ? `hsl(${hue} 50% 40% / 0.4)` : `hsl(${hue} 45% 80%)`}`,
            }}>{initials(name)}</span>
        )
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

    // Insert day-divider rows between top-level items whose day changes.
    const rows = useMemo(() => {
        const out: Array<{ type: 'divider'; key: string; label: string } | { type: 'item'; it: ThreadItem }> = []
        let lastDay: string | null = null
        for (const it of topLevel) {
            const k = dayKey(it.createdAt)
            if (k !== lastDay) { out.push({ type: 'divider', key: `d-${k}`, label: dayLabel(it.createdAt) }); lastDay = k }
            out.push({ type: 'item', it })
        }
        return out
    }, [topLevel]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── @mention autocomplete: detect the token at the cursor ──────────────────
    const onComposerChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value
        setBody(val)
        if (!onSearchMembers) return
        const caret = e.target.selectionStart ?? val.length
        const upToCaret = val.slice(0, caret)
        const m = upToCaret.match(/(^|[\s(])@([a-zA-Z0-9_.\-]*)$/)
        setMentionQuery(m ? m[2] : null)
    }
    const insertMention = (member: MentionMember) => {
        const el = composerRef.current
        const caret = el?.selectionStart ?? body.length
        const before = body.slice(0, caret).replace(/@([a-zA-Z0-9_.\-]*)$/, `@${member.username} `)
        const after = body.slice(caret)
        const next = before + after
        setBody(next)
        setMentionQuery(null)
        setTimeout(() => { el?.focus(); const p = before.length; el?.setSelectionRange(p, p) }, 0)
    }
    const mentionOpen = mentionQuery != null && mentionResults.length > 0

    const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (mentionOpen) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionResults.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionResults.length) % mentionResults.length); return }
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionResults[mentionIdx]); return }
            if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return }
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
    }

    const renderBodyHtml = (t: string) => (
        <div className="tc-body" style={{ fontSize: 13, color: c.text, lineHeight: 1.5, wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(t) }} />
    )

    const submit = async () => {
        const v = body.trim()
        if (!v || busy) return
        setBusy(true); setErr(null)
        const res = await onPost(v, internal ? 'INTERNAL' : 'CLIENT', replyTo?.id ?? null)
        setBusy(false)
        if (res?.success) { setBody(''); setInternal(false); setReplyTo(null); setMentionQuery(null); onRefresh() }
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

    const runAction = async (fn: () => Promise<Result>) => {
        setBusy(true)
        const res = await fn()
        setBusy(false)
        if (res?.success) onRefresh()
        else if (res?.error) setErr(res.error)
    }

    const startReply = (it: ThreadItem) => {
        setReplyTo({ id: it.id, name: it.authorName })
        setTimeout(() => composerRef.current?.focus(), 0)
    }

    // ── Assignee picker popover (C2) — reuses onSearchMembers ───────────────────
    const AssignPicker = ({ commentId }: { commentId: string }) => {
        const [q, setQ] = useState('')
        const [res, setRes] = useState<MentionMember[]>([])
        useEffect(() => {
            if (!onSearchMembers) return
            let alive = true
            const t = setTimeout(async () => { try { const r = await onSearchMembers(q); if (alive) setRes(r) } catch { /* ignore */ } }, 120)
            return () => { alive = false; clearTimeout(t) }
        }, [q])
        return (
            <div style={{ position: 'absolute', top: 26, left: 0, zIndex: 30, width: 220, padding: 6, borderRadius: 10, background: c.pop, border: `1px solid ${c.popLine}`, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm người…"
                    style={{ width: '100%', fontSize: 12.5, color: c.text, background: c.inputBg, border: `1px solid ${c.inputLine}`, borderRadius: 7, padding: '6px 8px', outline: 'none', marginBottom: 5 }} />
                <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {res.length === 0 ? (
                        <div style={{ fontSize: 12, color: c.faint, padding: '6px 8px' }}>{L.noMembers}</div>
                    ) : res.map((m) => (
                        <button key={m.id} onClick={() => { setAssignFor(null); runAction(() => onAssign!(commentId, m.id)) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 7, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 7, padding: '5px 7px', color: c.text }}>
                            <Avatar name={m.nickname || m.username} />
                            <span style={{ fontSize: 12.5 }}>{m.nickname || m.username}</span>
                        </button>
                    ))}
                </div>
            </div>
        )
    }

    // ── C2 action-item strip (staff/dark only) ─────────────────────────────────
    const renderActionStrip = (it: ThreadItem) => {
        if (!canAssign || !onAssign) return null
        const assigned = !!it.actionAssignedToId
        const resolved = !!it.actionResolvedAt
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, marginLeft: 2, position: 'relative' }}>
                {assigned && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '2px 8px',
                        color: resolved ? c.doneText : c.openText, background: resolved ? c.doneBg : c.openBg,
                        border: `1px solid ${resolved ? c.doneLine : c.openLine}`,
                    }}>
                        {resolved ? <CheckCircle2 size={11} /> : <CircleDot size={11} />}
                        {L.assignedTo} {it.actionAssignedToName} · {resolved ? L.resolved : L.open}
                    </span>
                )}
                {!assigned && (
                    <button onClick={() => setAssignFor(assignFor === it.id ? null : it.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', background: 'none', border: `1px dashed ${c.chipLine}`, color: c.faint, borderRadius: 8, padding: '3px 8px' }}>
                        <UserPlus size={12} /> {L.assign}
                    </button>
                )}
                {assigned && !resolved && onResolve && (
                    <button onClick={() => runAction(() => onResolve(it.id))} disabled={busy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', background: c.doneBg, border: `1px solid ${c.doneLine}`, color: c.doneText, borderRadius: 8, padding: '3px 8px' }}>
                        <Check size={12} /> {L.resolve}
                    </button>
                )}
                {assigned && resolved && onReopen && (
                    <button onClick={() => runAction(() => onReopen(it.id))} disabled={busy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, cursor: 'pointer', background: 'none', border: `1px solid ${c.chipLine}`, color: c.muted, borderRadius: 8, padding: '3px 8px' }}>
                        <RotateCcw size={12} /> {L.reopen}
                    </button>
                )}
                {assigned && (
                    <button onClick={() => setAssignFor(assignFor === it.id ? null : it.id)}
                        style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: c.faint, padding: '2px 4px' }}>{L.reassign}</button>
                )}
                {assigned && (
                    <button onClick={() => runAction(() => onAssign(it.id, null))}
                        style={{ fontSize: 11, cursor: 'pointer', background: 'none', border: 'none', color: c.faint, padding: '2px 4px' }}>{L.unassign}</button>
                )}
                {assignFor === it.id && onSearchMembers && <AssignPicker commentId={it.id} />}
            </div>
        )
    }

    const renderComment = (it: ThreadItem, isReply: boolean) => (
        <div key={it.id} style={{ marginLeft: isReply ? 20 : 0, paddingLeft: isReply ? 10 : 0, borderLeft: isReply ? `2px solid ${c.line}` : 'none' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Avatar name={it.authorName} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ borderRadius: 12, padding: '9px 11px', background: it.visibility === 'INTERNAL' ? c.internalBg : c.bubble, border: `1px solid ${it.visibility === 'INTERNAL' ? c.internalLine : c.bubbleLine}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: c.text }}>{it.authorName}</span>
                            {it.visibility === 'INTERNAL' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: c.internalText, background: c.internalBg, border: `1px solid ${c.internalLine}`, borderRadius: 999, padding: '1px 6px' }}>
                                    <Lock size={9} /> {L.internalTag}
                                </span>
                            )}
                            <span style={{ fontSize: 11, color: c.faint }}>{timeOnly(it.createdAt)}{it.editedAt ? ` · ${L.edited}` : ''}</span>
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
                        ) : renderBodyHtml(it.body || '')}
                    </div>

                    {/* C2 action-item strip (staff only) */}
                    {editingId !== it.id && renderActionStrip(it)}

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
            </div>
        </div>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            <style>{`
                .tc-body .tc-mention { color: ${c.mention}; font-weight: 600; }
                .tc-body code { background: ${c.chip}; border: 1px solid ${c.chipLine}; border-radius: 4px; padding: 0 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
                .tc-body a { color: ${c.mention}; text-decoration: underline; }
                .tc-body del { opacity: 0.65; }
            `}</style>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${c.line}`, fontSize: 12.5, fontWeight: 700, letterSpacing: '0.02em', color: c.muted, flexShrink: 0 }}>
                {L.header}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
                {loading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 24, color: c.faint }}><Loader2 className="animate-spin" size={18} /></div>
                ) : topLevel.length === 0 ? (
                    <div style={{ color: c.faint, fontSize: 13, textAlign: 'center', padding: '24px 8px' }}>{L.empty}</div>
                ) : rows.map((row) => row.type === 'divider' ? (
                    <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0' }}>
                        <span style={{ flex: 1, height: 1, background: c.line }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', color: c.faint, textTransform: 'uppercase' }}>{row.label}</span>
                        <span style={{ flex: 1, height: 1, background: c.line }} />
                    </div>
                ) : row.it.kind === 'event' ? (
                    <div key={row.it.id} style={{ fontSize: 11.5, color: c.faint, display: 'flex', gap: 6, alignItems: 'baseline', paddingLeft: 2 }}>
                        <span style={{ width: 5, height: 5, borderRadius: 999, background: c.faint, flexShrink: 0, marginTop: 5 }} />
                        <span><strong style={{ color: c.muted, fontWeight: 600 }}>{row.it.authorName}</strong> {row.it.label} · {fmt(row.it.createdAt)}</span>
                    </div>
                ) : renderComment(row.it, false))}
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
                <div style={{ position: 'relative' }}>
                    {/* [B3] @mention dropdown */}
                    {mentionOpen && (
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, zIndex: 40, width: 240, maxHeight: 200, overflowY: 'auto', padding: 5, borderRadius: 10, background: c.pop, border: `1px solid ${c.popLine}`, boxShadow: '0 -8px 28px rgba(0,0,0,0.35)' }}>
                            {mentionResults.map((m, i) => (
                                <button key={m.id} onMouseDown={(e) => { e.preventDefault(); insertMention(m) }}
                                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 7, textAlign: 'left', cursor: 'pointer', borderRadius: 7, padding: '5px 7px', border: 'none', background: i === mentionIdx ? c.accentSoft : 'transparent', color: c.text }}>
                                    <Avatar name={m.nickname || m.username} />
                                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{m.nickname || m.username}</span>
                                    <span style={{ fontSize: 11, color: c.faint }}>@{m.username}</span>
                                </button>
                            ))}
                        </div>
                    )}
                    <textarea
                        ref={composerRef}
                        value={body}
                        onChange={onComposerChange}
                        onKeyDown={onComposerKeyDown}
                        rows={2}
                        placeholder={L.placeholder}
                        style={{ width: '100%', fontSize: 13, color: c.text, background: c.inputBg, border: `1px solid ${c.inputLine}`, borderRadius: 10, padding: '9px 11px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                    />
                </div>
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
