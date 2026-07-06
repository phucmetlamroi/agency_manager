// [Review module P4.3] Comment composer (PRD FR-E03/E07). Typing auto-pauses the
// video; a timecode chip tracks the playhead (video only) and can be toggled off for
// a general comment. Public/Internal selector defaults to Nội bộ and is remembered
// for the session. Enter sends, Shift+Enter = newline; focus returns to the player
// after send so Space resumes playback. Reply mode is compact (inherits visibility,
// no timecode). Range brackets + annotation + emoji/attach hook in at P4.4/P4.5.

'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Globe, Clock, X, Loader2, Send } from 'lucide-react'
import { frameToSmpte, type Fps } from '@/lib/review/timecode'
import { createComment, type CommentDto } from '@/lib/review/comment-client'

const SS_KEY = 'review:composer:isInternal'

export function CommentComposer({
    versionId,
    fps,
    mediaKind,
    playheadFrame,
    onPauseVideo,
    onPosted,
    onFocusPlayer,
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
    parentId?: string | null
    parentIsInternal?: boolean
    autoFocus?: boolean
    onCancel?: () => void
}) {
    const isReply = parentId != null
    const [body, setBody] = useState('')
    const [attachTime, setAttachTime] = useState(mediaKind === 'video')
    const [isInternal, setIsInternal] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [frozenFrame, setFrozenFrame] = useState<number | null>(null)
    const taRef = useRef<HTMLTextAreaElement>(null)

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

    // The chip tracks the live playhead until the user starts typing (which pauses),
    // then freezes at that frame.
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

    const onChange = (v: string) => {
        if (body.length === 0 && v.length > 0 && mediaKind === 'video') {
            onPauseVideo()
            setFrozenFrame(playheadFrame)
        }
        if (v.length === 0) setFrozenFrame(null)
        setBody(v)
    }

    const submit = async () => {
        const text = body.trim()
        if (!text || submitting) return
        setSubmitting(true)
        try {
            const startFrame = !isReply && attachTime && mediaKind === 'video' ? shownFrame : null
            const { comment } = await createComment(versionId, {
                body: text,
                parentId: isReply ? parentId : undefined,
                startFrame,
                isInternal: isReply ? undefined : isInternal,
            })
            onPosted(comment)
            setBody('')
            setFrozenFrame(null)
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

    return (
        <div className={isReply ? 'pl-9 pr-1 pt-1' : 'border-t border-white/5 bg-zinc-950/80 p-2.5'}>
            {/* timestamp + visibility row (top-level only) */}
            {!isReply && (
                <div className="mb-1.5 flex items-center gap-2">
                    {mediaKind === 'video' &&
                        (attachTime ? (
                            <button
                                onClick={() => setAttachTime(false)}
                                className="group flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-1 text-xs font-medium text-indigo-300 hover:bg-indigo-500/25"
                                title="Bỏ mốc thời gian"
                            >
                                <Clock className="h-3 w-3" />
                                <span className="font-mono tabular-nums">{fps ? frameToSmpte(shownFrame, fps) : shownFrame}</span>
                                <X className="h-3 w-3 opacity-50 group-hover:opacity-100" />
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    setAttachTime(true)
                                    setFrozenFrame(playheadFrame)
                                }}
                                className="flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 hover:text-white/80"
                            >
                                <Clock className="h-3 w-3" /> Gắn thời gian
                            </button>
                        ))}
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
                    placeholder={isReply ? 'Trả lời…' : 'Thêm bình luận…'}
                    className="min-h-[38px] flex-1 resize-none rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
                />
                <button
                    onClick={() => void submit()}
                    disabled={!body.trim() || submitting}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-40"
                    aria-label="Gửi"
                >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>
        </div>
    )
}
