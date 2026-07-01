'use client'

/**
 * [Video Review] Full-screen review surface opened from a deliverable in the
 * token portal. Player (Cloudflare Stream) + timecode-anchored comments +
 * version switcher + Approve / Request-changes, with live comment updates over
 * Supabase Realtime. Credential-agnostic: every server call goes through the
 * injected `actions` adapter (token is closed over in SharePortalClient).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Send, Check, RotateCcw, MessageSquare, Clock, Loader2, Film, CheckCircle2 } from 'lucide-react'
import ReviewPlayer, { type ReviewPlayerHandle } from './ReviewPlayer'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { REVIEW_EVENTS, getReviewVersionChannel } from '@/lib/review-channels'
import type { DeliverableActions } from '../types'
import type { ReviewSnapshot, ReviewVersionDTO, ReviewCommentDTO } from '../review-types'

function fmtTime(sec: number | null): string {
    if (sec == null || !isFinite(sec)) return '—'
    const s = Math.max(0, Math.floor(sec))
    const m = Math.floor(s / 60)
    const r = s % 60
    return `${m}:${String(r).padStart(2, '0')}`
}

const STATUS_META: Record<string, { label: string; fg: string; bg: string; line: string }> = {
    NEEDS_REVIEW: { label: 'Needs review', fg: 'var(--attn)', bg: 'var(--attn-soft, rgba(180,120,20,.1))', line: 'var(--attn-line, rgba(180,120,20,.3))' },
    IN_PROGRESS: { label: 'In progress', fg: 'var(--accent-fg)', bg: 'var(--accent-soft)', line: 'var(--accent-line)' },
    APPROVED: { label: 'Approved', fg: 'var(--ok)', bg: 'var(--ok-soft)', line: 'var(--ok-line)' },
    NEEDS_CHANGES: { label: 'Changes requested', fg: 'var(--danger)', bg: 'var(--danger-soft)', line: 'var(--danger-line)' },
}

function VersionStatusBadge({ status }: { status: string }) {
    const m = STATUS_META[status] ?? STATUS_META.NEEDS_REVIEW
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 700, color: m.fg, background: m.bg, border: `1px solid ${m.line}`, whiteSpace: 'nowrap' }}>
            {m.label}
        </span>
    )
}

export default function ReviewOverlay({ taskId, title, actions, onClose, onApproved, onChangesRequested }: {
    taskId: string
    title: string
    actions: DeliverableActions
    onClose: () => void
    onApproved?: () => void
    onChangesRequested?: () => void
}) {
    const [snap, setSnap] = useState<ReviewSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [err, setErr] = useState<string | null>(null)
    const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
    const [comments, setComments] = useState<ReviewCommentDTO[]>([])
    const [curTime, setCurTime] = useState(0)
    const [withTimecode, setWithTimecode] = useState(true)
    const [body, setBody] = useState('')
    const [busy, setBusy] = useState(false)
    const [changeMode, setChangeMode] = useState(false)
    const [changeNote, setChangeNote] = useState('')
    const [actionErr, setActionErr] = useState<string | null>(null)
    const [approved, setApproved] = useState(false)

    const playerRef = useRef<ReviewPlayerHandle>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Load the snapshot on open.
    useEffect(() => {
        let alive = true
        if (!actions.getReview) { setLoading(false); return }
        actions.getReview(taskId)
            .then((res) => {
                if (!alive) return
                if (res) {
                    setSnap(res)
                    setCurrentVersionId(res.currentVersionId)
                    setComments(res.comments)
                } else setErr('This video is no longer available.')
                setLoading(false)
            })
            .catch(() => { if (alive) { setErr('Could not load the review. Please reload.'); setLoading(false) } })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [taskId])

    // Live comment / status updates on the current version's channel.
    const onRealtime = useCallback((event: string, payload: any) => {
        if (event === REVIEW_EVENTS.COMMENT_NEW && payload?.id) {
            setComments((prev) => (prev.some((c) => c.id === payload.id) ? prev : [...prev, payload as ReviewCommentDTO]))
        }
    }, [])
    useSupabaseChannel(currentVersionId ? getReviewVersionChannel(currentVersionId) : '', onRealtime, !!currentVersionId)

    const versions: ReviewVersionDTO[] = snap?.versions ?? []
    const current = versions.find((v) => v.id === currentVersionId) ?? null
    const canComment = !!snap?.caps.allowVideoComments && !approved
    const canApprove = !!snap?.caps.canApprove && !approved && current?.status !== 'APPROVED'

    const switchVersion = async (vid: string) => {
        if (vid === currentVersionId) return
        setCurrentVersionId(vid)
        setComments([])
        if (actions.getVersionComments) {
            try { setComments(await actions.getVersionComments(taskId, vid)) } catch { /* noop */ }
        }
    }

    const sortedComments = [...comments].sort((a, b) => {
        const at = a.timestampSec ?? Number.POSITIVE_INFINITY
        const bt = b.timestampSec ?? Number.POSITIVE_INFINITY
        return at - bt || a.createdAt.localeCompare(b.createdAt)
    })

    const submitComment = async () => {
        if (!body.trim() || !currentVersionId || !actions.addReviewComment) return
        setBusy(true); setActionErr(null)
        const timestampSec = withTimecode && current?.iframeUrl ? (playerRef.current?.getTime() ?? curTime) : null
        const res = await actions.addReviewComment(taskId, currentVersionId, { body: body.trim(), timestampSec })
        setBusy(false)
        if (res.success && res.comment) {
            setComments((prev) => (prev.some((c) => c.id === res.comment!.id) ? prev : [...prev, res.comment!]))
            setBody('')
        } else setActionErr(res.error || 'Could not post your comment.')
    }

    const approve = async () => {
        if (!currentVersionId || !actions.approveReview) return
        setBusy(true); setActionErr(null)
        const res = await actions.approveReview(taskId, currentVersionId)
        setBusy(false)
        if (res.success) { setApproved(true); onApproved?.() }
        else setActionErr(res.error || 'Could not approve.')
    }

    const requestChanges = async () => {
        if (!changeNote.trim() || !currentVersionId || !actions.requestReviewChanges) return
        setBusy(true); setActionErr(null)
        const res = await actions.requestReviewChanges(taskId, currentVersionId, changeNote.trim())
        setBusy(false)
        if (res.success) { setChangeMode(false); setChangeNote(''); onChangesRequested?.() }
        else setActionErr(res.error || 'Could not send your request.')
    }

    const jumpTo = (c: ReviewCommentDTO) => {
        if (c.timestampSec != null) playerRef.current?.seekTo(c.timestampSec)
    }

    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.5)', zIndex: 90 }} />
            <div style={{ position: 'fixed', inset: '3vh 3vw', zIndex: 91, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 18, boxShadow: 'var(--shadow-panel)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                    <Film size={18} style={{ color: 'var(--accent-fg)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="eyebrow" style={{ fontSize: 10 }}>Video review</div>
                        <h2 style={{ margin: '2px 0 0', fontSize: 16, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h2>
                    </div>
                    {/* Version switcher */}
                    {versions.length > 0 && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {versions.map((v) => (
                                <button key={v.id} onClick={() => switchVersion(v.id)}
                                    style={{ height: 30, padding: '0 11px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                                        border: `1px solid ${v.id === currentVersionId ? 'var(--accent-line)' : 'var(--line-2)'}`,
                                        background: v.id === currentVersionId ? 'var(--accent-soft)' : 'transparent',
                                        color: v.id === currentVersionId ? 'var(--accent-fg)' : 'var(--fg-3)' }}>
                                    V{v.versionNumber}
                                </button>
                            ))}
                        </div>
                    )}
                    <button onClick={onClose} className="pc-btn pc-btn-quiet" style={{ padding: 8, borderRadius: 9 }}><X size={16} /></button>
                </div>

                {/* Body */}
                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-3)' }}><Loader2 className="animate-spin" size={24} /></div>
                ) : err ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', fontSize: 14 }}>{err}</div>
                ) : versions.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--fg-3)', textAlign: 'center', padding: 32 }}>
                        <Film size={34} style={{ opacity: 0.5 }} />
                        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--fg-1)' }}>No cut uploaded yet</div>
                        <p style={{ margin: 0, fontSize: 13, maxWidth: 320, lineHeight: 1.5 }}>The team will upload the video here for your review. You&apos;ll get a notification the moment it&apos;s ready.</p>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', minHeight: 0, flexWrap: 'wrap' }}>
                        {/* Left: player + composer */}
                        <div style={{ flex: '1 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', padding: 18, gap: 14, overflowY: 'auto' }}>
                            {current?.iframeUrl ? (
                                <ReviewPlayer ref={playerRef} iframeUrl={current.iframeUrl} onTime={setCurTime} />
                            ) : (
                                <div style={{ width: '100%', aspectRatio: '16 / 9', maxHeight: '62vh', background: '#0b0b0d', borderRadius: 12, border: '1px solid var(--line-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'rgba(255,255,255,.5)' }}>
                                    <Loader2 className="animate-spin" size={22} />
                                    <span style={{ fontSize: 12.5 }}>Video is processing…</span>
                                </div>
                            )}

                            {/* Composer */}
                            {canComment && (
                                <div className="pc-card" style={{ padding: 12, background: 'var(--surface-2)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <button onClick={() => setWithTimecode((v) => !v)} disabled={!current?.iframeUrl}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 10px', borderRadius: 999, cursor: current?.iframeUrl ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                                                border: `1px solid ${withTimecode && current?.iframeUrl ? 'var(--accent-line)' : 'var(--line-2)'}`,
                                                background: withTimecode && current?.iframeUrl ? 'var(--accent-soft)' : 'transparent',
                                                color: withTimecode && current?.iframeUrl ? 'var(--accent-fg)' : 'var(--fg-3)' }}>
                                            <Clock size={12} /> {withTimecode && current?.iframeUrl ? `At ${fmtTime(curTime)}` : 'No timecode'}
                                        </button>
                                    </div>
                                    <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Leave a comment at this moment…" className="pc-input" style={{ height: 'auto', padding: '9px 11px', resize: 'vertical', lineHeight: 1.5 }} />
                                    {actionErr && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{actionErr}</p>}
                                    <button className="pc-btn pc-btn-primary" style={{ width: '100%', justifyContent: 'center', gap: 7, marginTop: 9 }} disabled={busy || !body.trim()} onClick={submitComment}>
                                        {busy ? <Loader2 className="animate-spin" size={15} /> : <Send size={14} />} Comment
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Right: status + comments + approve */}
                        <div style={{ flex: '1 1 340px', minWidth: 0, maxWidth: 440, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--line)', minHeight: 0 }}>
                            {current && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
                                    <VersionStatusBadge status={approved ? 'APPROVED' : current.status} />
                                    <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Version {current.versionNumber}{current.label ? ` · ${current.label}` : ''}</span>
                                </div>
                            )}

                            {/* Comments list */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                                {sortedComments.length === 0 ? (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--fg-3)', fontSize: 13, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                                        <MessageSquare size={22} style={{ opacity: 0.5 }} />
                                        No comments yet — scrub to a moment and leave your first note.
                                    </div>
                                ) : sortedComments.map((c) => (
                                    <button key={c.id} onClick={() => jumpTo(c)}
                                        style={{ textAlign: 'left', border: '1px solid var(--line)', background: 'var(--surface-2)', borderRadius: 11, padding: '10px 12px', cursor: c.timestampSec != null ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            {c.timestampSec != null && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: 'var(--accent-fg)' }}>
                                                    <Clock size={11} /> {fmtTime(c.timestampSec)}
                                                </span>
                                            )}
                                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-1)' }}>{c.authorName}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{c.body}</p>
                                    </button>
                                ))}
                            </div>

                            {/* Approve / request-changes */}
                            <div style={{ borderTop: '1px solid var(--line)', padding: 14, flexShrink: 0 }}>
                                {approved || current?.status === 'APPROVED' ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--ok)', fontSize: 13.5, fontWeight: 700, padding: '6px 0' }}>
                                        <CheckCircle2 size={17} /> Approved
                                    </div>
                                ) : changeMode ? (
                                    <div>
                                        <textarea value={changeNote} onChange={(e) => setChangeNote(e.target.value)} rows={3} autoFocus placeholder="What would you like changed?" className="pc-input" style={{ height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.5 }} />
                                        {actionErr && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{actionErr}</p>}
                                        <div style={{ display: 'flex', gap: 9, marginTop: 10 }}>
                                            <button className="pc-btn pc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !changeNote.trim()} onClick={requestChanges}>Send to team</button>
                                            <button className="pc-btn pc-btn-quiet" disabled={busy} onClick={() => { setChangeMode(false); setChangeNote('') }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', gap: 9 }}>
                                        <button className="pc-btn pc-btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={busy || !canApprove} onClick={approve}><Check size={16} /> Approve</button>
                                        <button className="pc-btn pc-btn-ghost" style={{ flex: 1, justifyContent: 'center' }} disabled={busy} onClick={() => { setChangeMode(true); setActionErr(null) }}><RotateCcw size={15} /> Request changes</button>
                                    </div>
                                )}
                                {actionErr && !changeMode && <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--danger)' }}>{actionErr}</p>}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}
