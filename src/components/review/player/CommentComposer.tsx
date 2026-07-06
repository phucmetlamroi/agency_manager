// [Review module P4.3 + P4.4] Comment composer (PRD FR-E03/E05/E07). Typing
// auto-pauses the video; a timecode chip tracks the playhead (video only) and can be
// toggled off for a general comment. P4.4 adds: a RANGE (In–Out) bracket, and a "Vẽ"
// button that opens the annotation overlay pinned to the frozen frame — its shapes
// submit alongside the comment (so a drawing-only comment is allowed). Public/Internal
// selector defaults to Nội bộ and is remembered for the session. Enter sends,
// Shift+Enter = newline; focus returns to the player after send. Reply mode is compact
// (inherits visibility, no timecode / range / annotation).

'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Globe, Clock, X, Loader2, Send, PenLine, Brackets } from 'lucide-react'
import { frameToSmpte, type Fps } from '@/lib/review/timecode'
import { createComment, type CommentDto } from '@/lib/review/comment-client'
import type { AnnotationController } from './useAnnotation'

const SS_KEY = 'review:composer:isInternal'

export function CommentComposer({
    versionId,
    fps,
    mediaKind,
    playheadFrame,
    onPauseVideo,
    onPosted,
    onFocusPlayer,
    annotation = null,
    parentId = null,
    parentIsInternal,
    autoFocus = false,
    onCancel,
}: {
    versionId: string
    fps: Fps | null
    mediaKind: 'video' | 'image'
    playheadFrame: number
    onPauseVideo: () => void
    onPosted: (c: CommentDto) => void
    onFocusPlayer: () => void
    annotation?: AnnotationController | null
    parentId?: string | null
    parentIsInternal?: boolean
    autoFocus?: boolean
    onCancel?: () => void
}) {
    const isReply = parentId != null
    const isVideo = mediaKind === 'video'
    const canAnnotate = !isReply && isVideo && annotation != null
    const [body, setBody] = useState('')
    const [attachTime, setAttachTime] = useState(isVideo && !isReply)
    const [isInternal, setIsInternal] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [frozenFrame, setFrozenFrame] = useState<number | null>(null)
    const [rangeEnd, setRangeEnd] = useState<number | null>(null)
    const taRef = useRef<HTMLTextAreaElement>(null)

    const annoActive = canAnnotate && annotation!.active
    const annoCount = annotation?.shapes.length ?? 0
    // Annotation is pinned to a frame → force the timecode on while drawing.
    const timeAttached = isVideo && !isReply && (attachTime || annoActive)

    useEffect(() => {
        if (isReply) {
            setIsInternal(parentIsInternal ?? true)
            return
        }
        try {
            const saved = sessionStorage.getItem(SS_KEY)
            if (saved != null) setIsInternal(saved === '1')
        } catch {
            /* ignore */
        }
    }, [isReply, parentIsInternal])

    useEffect(() => {
        if (autoFocus) taRef.current?.focus()
    }, [autoFocus])

    // The chip tracks the live playhead until the user starts typing / drawing (which
    // pauses), then freezes at that frame.
    const shownFrame = frozenFrame ?? playheadFrame

    const setInternalPersist = (v: boolean) => {
        setIsInternal(v)
        if (!isReply) {
            try {
                sessionStorage.setItem(SS_KEY, v ? '1' : '0')
            } catch {
                /* ignore */
            }
        }
    }

    const freezeHere = (): number => {
        const f = playheadFrame
        setFrozenFrame(f)
        return f
    }

    const onChange = (v: string) => {
        if (body.length === 0 && v.length > 0 && isVideo) {
            onPauseVideo()
            if (!annoActive) setFrozenFrame(playheadFrame) // keep the draw frame if drawing
        }
        // Don't unfreeze while an annotation is pinned to this frame.
        if (v.length === 0 && !annoActive) setFrozenFrame(null)
        setBody(v)
    }

    const beginDraw = () => {
        onPauseVideo()
        setAttachTime(true)
        const f = frozenFrame ?? freezeHere()
        annotation?.begin(f)
    }

    const enableRange = () => {
        onPauseVideo()
        setAttachTime(true)
        const inF = frozenFrame ?? freezeHere()
        setRangeEnd(Math.max(inF + 1, playheadFrame))
    }
    const captureOut = () => setRangeEnd(Math.max(shownFrame + 1, playheadFrame))

    const canSend = !!body.trim() || (annoActive && annoCount > 0)

    const submit = async () => {
        if (!canSend || submitting) return
        const text = body.trim()
        setSubmitting(true)
        try {
            const startFrame = timeAttached ? shownFrame : null
            const endFrame =
                startFrame != null && rangeEnd != null && rangeEnd > startFrame ? rangeEnd : null
            const shapes = annoActive && annoCount > 0 ? annotation!.shapes : undefined
            const { comment } = await createComment(versionId, {
                body: text || undefined,
                parentId: isReply ? parentId : undefined,
                startFrame,
                endFrame,
                annotation: shapes,
                isInternal: isReply ? undefined : isInternal,
            })
            onPosted(comment)
            setBody('')
            setFrozenFrame(null)
            setRangeEnd(null)
            annotation?.reset()
            if (isReply) onCancel?.()
            else onFocusPlayer()
        } catch (e) {
            // surface minimally; the poll will reconcile if it actually landed
            alert(e instanceof Error ? e.message : 'Không gửi được bình luận.')
        } finally {
            setSubmitting(false)
        }
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void submit()
        } else if (e.key === 'Escape') {
            if (isReply) onCancel?.()
        }
    }

    const smpte = (f: number) => (fps ? frameToSmpte(f, fps) : String(f))

    return (
        <div className={isReply ? 'pl-9 pr-1 pt-1' : 'border-t border-white/5 bg-zinc-950/80 p-2.5'}>
            {/* timestamp + range + draw + visibility row (top-level only) */}
            {!isReply && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    {isVideo &&
                        (timeAttached ? (
                            <span className="flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-300">
                                <Clock className="h-3 w-3" />
                                <span className="font-mono tabular-nums">{smpte(shownFrame)}</span>
                                {rangeEnd != null && rangeEnd > shownFrame && (
                                    <span className="font-mono tabular-nums text-indigo-200/80"> – {smpte(rangeEnd)}</span>
                                )}
                                {!annoActive && (
                                    <button
                                        onClick={() => {
                                            setAttachTime(false)
                                            setRangeEnd(null)
                                        }}
                                        className="opacity-50 hover:opacity-100"
                                        title="Bỏ mốc thời gian"
                                        aria-label="Bỏ mốc thời gian"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        ) : (
                            <button
                                onClick={() => setAttachTime(true)}
                                className="flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 hover:text-white/80"
                            >
                                <Clock className="h-3 w-3" /> Gắn thời gian
                            </button>
                        ))}

                    {/* range In–Out */}
                    {isVideo &&
                        timeAttached &&
                        (rangeEnd != null && rangeEnd > shownFrame ? (
                            <button
                                onClick={captureOut}
                                className="flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/15"
                                title="Đặt điểm cuối = vị trí hiện tại"
                            >
                                <Brackets className="h-3 w-3" /> Đặt cuối
                            </button>
                        ) : (
                            <button
                                onClick={enableRange}
                                className="flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 hover:text-white/80"
                                title="Tạo bình luận theo khoảng"
                            >
                                <Brackets className="h-3 w-3" /> Khoảng
                            </button>
                        ))}

                    {/* draw / annotation */}
                    {canAnnotate && (
                        <button
                            onClick={annoActive ? () => annotation!.reset() : beginDraw}
                            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                annoActive ? 'bg-indigo-500 text-white' : 'border border-dashed border-white/15 text-white/50 hover:text-white/80'
                            }`}
                            title={annoActive ? 'Đang vẽ — bấm để thoát' : 'Vẽ chú thích lên khung hình'}
                        >
                            <PenLine className="h-3 w-3" />
                            {annoActive ? `Đang vẽ${annoCount ? ` · ${annoCount}` : ''}` : 'Vẽ'}
                        </button>
                    )}

                    <div className="flex-1" />
                    <button
                        onClick={() => setInternalPersist(!isInternal)}
                        className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                            isInternal ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                        title={isInternal ? 'Chỉ nội bộ thấy' : 'Khách cũng thấy'}
                    >
                        {isInternal ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                        {isInternal ? 'Nội bộ' : 'Công khai'}
                    </button>
                </div>
            )}

            <div className="flex items-end gap-2">
                <textarea
                    ref={taRef}
                    value={body}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={isReply ? 1 : 2}
                    placeholder={isReply ? 'Trả lời…' : annoActive ? 'Ghi chú cho hình vẽ (tuỳ chọn)…' : 'Thêm bình luận…'}
                    className="min-h-[38px] flex-1 resize-none rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
                />
                <button
                    onClick={() => void submit()}
                    disabled={!canSend || submitting}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-40"
                    aria-label="Gửi"
                >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </div>
    )
}
