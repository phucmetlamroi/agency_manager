'use client'

/**
 * [Video Review · staff] The editor/admin review surface. Opens from the
 * TaskDetailModal "Bàn giao" card: watch the uploaded cut in-app, read BOTH
 * internal + client comments (threaded), leave notes (internal or client-
 * visible), reply, and tick notes off as resolved.
 *
 * All data comes from session-gated actions in video-review-staff-actions.ts.
 * Internal comments never leave this authenticated surface. Dark-glass violet
 * aesthetic to match the admin modal (distinct from the light client portal).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
    X, Film, Send, MessageSquare, Clock, Loader2, CornerDownRight,
    Lock, Eye, CheckCircle2, RotateCcw,
} from 'lucide-react'
import ReviewPlayer, { type ReviewPlayerHandle } from '@/components/portal/calm/review/ReviewPlayer'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getReviewTaskChannel } from '@/lib/review-channels'
import {
    getStaffReview, getStaffVersionComments, postStaffReviewComment,
    resolveReviewComment, reopenReviewComment,
} from '@/actions/video-review-staff-actions'
import type { StaffReviewSnapshot, StaffReviewVersionDTO, StaffReviewCommentDTO } from '@/components/portal/calm/review-types'

function fmtTime(sec: number | null): string {
    if (sec == null || !isFinite(sec)) return '—'
    const s = Math.max(0, Math.floor(sec))
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export default function StaffReviewPanel({ taskId }: { taskId: string }) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [err, setErr] = useState<string | null>(null)
    const [snap, setSnap] = useState<StaffReviewSnapshot | null>(null)
    const [currentVersionId, setCurrentVersionId] = useState<string | null>(null)
    const [comments, setComments] = useState<StaffReviewCommentDTO[]>([])
    const [curTime, setCurTime] = useState(0)
    const [body, setBody] = useState('')
    const [visibility, setVisibility] = useState<'INTERNAL' | 'CLIENT'>('INTERNAL')
    const [withTimecode, setWithTimecode] = useState(true)
    const [replyTo, setReplyTo] = useState<StaffReviewCommentDTO | null>(null)
    const [busy, setBusy] = useState(false)

    const playerRef = useRef<ReviewPlayerHandle>(null)

    const load = useCallback(async () => {
        setLoading(true); setErr(null)
        const res = await getStaffReview(taskId)
        if (res.success && res.snapshot) {
            setSnap(res.snapshot)
            setCurrentVersionId(res.snapshot.currentVersionId)
            setComments(res.snapshot.comments)
        } else setErr(res.error || 'Không tải được bảng review.')
        setLoading(false)
    }, [taskId])

    useEffect(() => { if (open && !snap) void load() }, [open, snap, load])

    const refetchComments = useCallback(async (vid: string | null) => {
        if (!vid) return
        const res = await getStaffVersionComments(taskId, vid)
        if (res.success && res.comments) setComments(res.comments)
    }, [taskId])

    // Live: staff channel pings (new client comment, resolve, new version) → refetch.
    useSupabaseChannel(
        open && currentVersionId ? getReviewTaskChannel(taskId) : '',
        () => { void refetchComments(currentVersionId) },
        open && !!currentVersionId,
    )

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
        if (open) window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [open])

    const versions: StaffReviewVersionDTO[] = snap?.versions ?? []
    const current = versions.find((v) => v.id === currentVersionId) ?? null

    const switchVersion = async (vid: string) => {
        if (vid === currentVersionId) return
        setCurrentVersionId(vid); setComments([]); setReplyTo(null)
        await refetchComments(vid)
    }

    const submit = async () => {
        if (!body.trim() || !currentVersionId) return
        setBusy(true); setErr(null)
        const timestampSec = !replyTo && withTimecode && current?.iframeUrl ? (playerRef.current?.getTime() ?? curTime) : null
        const res = await postStaffReviewComment(taskId, currentVersionId, {
            body: body.trim(), timestampSec,
            visibility: replyTo ? undefined : visibility,
            parentId: replyTo?.id ?? null,
        })
        setBusy(false)
        if (res.success) { setBody(''); setReplyTo(null); void refetchComments(currentVersionId) }
        else setErr(res.error || 'Không gửi được bình luận.')
    }

    const toggleResolve = async (c: StaffReviewCommentDTO) => {
        const res = c.completed ? await reopenReviewComment(c.id) : await resolveReviewComment(c.id)
        if (res.success) void refetchComments(currentVersionId)
    }

    const jumpTo = (c: StaffReviewCommentDTO) => { if (c.timestampSec != null) playerRef.current?.seekTo(c.timestampSec) }

    const renderComment = (c: StaffReviewCommentDTO, depth = 0) => (
        <div key={c.id} style={{ marginLeft: depth ? 18 : 0 }} className={depth ? 'border-l border-white/10 pl-3' : ''}>
            <div className={`rounded-xl border px-3 py-2.5 ${c.completed ? 'border-white/5 bg-white/[0.02] opacity-70' : 'border-white/10 bg-white/[0.03]'}`}>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {c.timestampSec != null && (
                        <button onClick={() => jumpTo(c)} className="inline-flex items-center gap-1 text-[11px] font-bold text-violet-300 hover:text-violet-200">
                            <Clock size={11} /> {fmtTime(c.timestampSec)}
                        </button>
                    )}
                    <span className="text-[12px] font-semibold text-zinc-200">{c.authorName}</span>
                    {c.visibility === 'INTERNAL' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-300"><Lock size={9} /> Nội bộ</span>
                    ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[9.5px] font-semibold text-emerald-300"><Eye size={9} /> Khách thấy</span>
                    )}
                    {c.completed && <span className="text-[9.5px] font-semibold text-zinc-500">✓ Đã xử lý</span>}
                </div>
                <p className="text-[12.5px] text-zinc-300 leading-relaxed whitespace-pre-wrap">{c.body}</p>
                <div className="flex items-center gap-3 mt-1.5">
                    <button onClick={() => { setReplyTo(c); setBody('') }} className="inline-flex items-center gap-1 text-[10.5px] text-zinc-500 hover:text-zinc-300">
                        <CornerDownRight size={11} /> Trả lời
                    </button>
                    <button onClick={() => toggleResolve(c)} className={`inline-flex items-center gap-1 text-[10.5px] ${c.completed ? 'text-zinc-500 hover:text-zinc-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                        {c.completed ? <><RotateCcw size={11} /> Mở lại</> : <><CheckCircle2 size={11} /> Đánh dấu xong</>}
                    </button>
                </div>
            </div>
            {c.replies?.length > 0 && <div className="mt-1.5 flex flex-col gap-1.5">{c.replies.map((r) => renderComment(r, depth + 1))}</div>}
        </div>
    )

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors"
            >
                <MessageSquare size={13} className="text-violet-400" /> Nhận xét & xem bản review
            </button>

            {open && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-[3vh] md:p-[3vw]" onClick={() => setOpen(false)}>
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                    <div onClick={(e) => e.stopPropagation()} className="relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
                        {/* Header */}
                        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3.5 flex-shrink-0">
                            <Film size={17} className="text-violet-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wide text-zinc-500">Bảng nhận xét video</div>
                                <div className="truncate text-[15px] font-bold text-zinc-100">{snap?.taskTitle ?? '…'}</div>
                            </div>
                            {versions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {versions.map((v) => (
                                        <button key={v.id} onClick={() => switchVersion(v.id)}
                                            className={`h-8 rounded-lg px-2.5 text-[12px] font-bold transition-colors ${v.id === currentVersionId ? 'bg-violet-500/20 border border-violet-500/40 text-violet-200' : 'border border-white/10 text-zinc-400 hover:bg-white/5'}`}>
                                            V{v.versionNumber}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-200"><X size={16} /></button>
                        </div>

                        {/* Body */}
                        {loading ? (
                            <div className="flex flex-1 items-center justify-center text-zinc-500"><Loader2 className="animate-spin" size={24} /></div>
                        ) : err ? (
                            <div className="flex flex-1 items-center justify-center text-red-400 text-sm">{err}</div>
                        ) : versions.length === 0 ? (
                            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-zinc-500 p-8">
                                <Film size={34} className="opacity-40" />
                                <div className="text-[15px] font-semibold text-zinc-300">Chưa có bản cắt nào</div>
                                <p className="max-w-xs text-[13px] leading-relaxed">Tải video review lên ở khung phía trên. Sau khi Cloudflare xử lý xong, bản cắt sẽ hiện ở đây để xem & nhận xét.</p>
                            </div>
                        ) : (
                            <div className="flex flex-1 min-h-0 flex-wrap">
                                {/* Left: player + composer */}
                                <div className="flex flex-[1_1_460px] min-w-0 flex-col gap-3.5 overflow-y-auto p-4">
                                    {current?.iframeUrl ? (
                                        <ReviewPlayer ref={playerRef} iframeUrl={current.iframeUrl} onTime={setCurTime} />
                                    ) : (
                                        <div className="flex aspect-video max-h-[62vh] w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-white/10 bg-black text-zinc-500">
                                            <Loader2 className="animate-spin" size={22} />
                                            <span className="text-[12.5px]">{current?.ready ? 'Chưa ký được link phát (thiếu SIGNING key)' : 'Cloudflare đang xử lý video…'}</span>
                                        </div>
                                    )}

                                    {/* Composer */}
                                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                        {replyTo ? (
                                            <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5">
                                                <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400 truncate">
                                                    <CornerDownRight size={12} /> Trả lời <b className="text-zinc-300">{replyTo.authorName}</b>: <span className="truncate text-zinc-500">{replyTo.body.slice(0, 40)}</span>
                                                </span>
                                                <button onClick={() => setReplyTo(null)} className="text-zinc-500 hover:text-zinc-300 shrink-0"><X size={13} /></button>
                                            </div>
                                        ) : (
                                            <div className="mb-2 flex items-center gap-2 flex-wrap">
                                                {/* Visibility segmented */}
                                                <div className="inline-flex rounded-lg border border-white/10 p-0.5">
                                                    <button onClick={() => setVisibility('INTERNAL')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${visibility === 'INTERNAL' ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-500 hover:text-zinc-300'}`}><Lock size={10} /> Nội bộ</button>
                                                    <button onClick={() => setVisibility('CLIENT')} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${visibility === 'CLIENT' ? 'bg-emerald-500/15 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300'}`}><Eye size={10} /> Gửi khách</button>
                                                </div>
                                                {/* Timecode */}
                                                <button onClick={() => setWithTimecode((v) => !v)} disabled={!current?.iframeUrl}
                                                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${withTimecode && current?.iframeUrl ? 'border-violet-500/40 bg-violet-500/10 text-violet-300' : 'border-white/10 text-zinc-500'}`}>
                                                    <Clock size={11} /> {withTimecode && current?.iframeUrl ? `Tại ${fmtTime(curTime)}` : 'Không mốc giờ'}
                                                </button>
                                            </div>
                                        )}
                                        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2}
                                            placeholder={replyTo ? 'Viết trả lời…' : visibility === 'INTERNAL' ? 'Ghi chú nội bộ cho team…' : 'Nhận xét gửi cho khách…'}
                                            className="w-full resize-y rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-violet-500/40" />
                                        <button onClick={submit} disabled={busy || !body.trim()}
                                            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 px-3 py-2 text-[12.5px] font-semibold text-violet-200 transition-colors disabled:opacity-40">
                                            {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={13} />} {replyTo ? 'Gửi trả lời' : 'Gửi nhận xét'}
                                        </button>
                                        {err && <p className="mt-2 text-[11.5px] text-red-400">{err}</p>}
                                    </div>
                                </div>

                                {/* Right: comments */}
                                <div className="flex flex-[1_1_340px] min-w-0 max-w-[460px] flex-col border-l border-white/10 min-h-0">
                                    <div className="border-b border-white/10 px-4 py-2.5 text-[12px] font-semibold text-zinc-400">
                                        Nhận xét {comments.length > 0 && <span className="text-zinc-600">· {comments.length}</span>}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
                                        {comments.length === 0 ? (
                                            <div className="m-auto flex flex-col items-center gap-2 text-center text-zinc-600 text-[13px]">
                                                <MessageSquare size={22} className="opacity-40" />
                                                Chưa có nhận xét nào cho bản này.
                                            </div>
                                        ) : comments.map((c) => renderComment(c))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
