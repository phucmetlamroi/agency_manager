// [Review module P4.3 + P4.4 + P4.5] Comment composer (PRD FR-E03/E05/E07). Typing
// auto-pauses the video; a timecode chip tracks the playhead (video only) and can be
// toggled off for a general comment. P4.4 adds a RANGE (In–Out) bracket + a "Vẽ" button
// that opens the annotation overlay pinned to the frozen frame. P4.5 adds an emoji
// picker (insert at caret) and image attachments (≤6, ≤10MB each) uploaded to R2 before
// submit — a drawing-only or image-only comment is allowed. Public/Internal defaults to
// Nội bộ (session-remembered). Enter sends, Shift+Enter = newline. Reply mode is compact
// (inherits visibility, no timecode / range / annotation).

'use client'

import { useEffect, useRef, useState } from 'react'
import { Lock, Globe, Clock, X, Loader2, Send, PenLine, Brackets, Smile, ImagePlus, RotateCcw } from 'lucide-react'
import { frameToSmpte, frameCount, type Fps } from '@/lib/review/timecode'
import { createComment, type CommentDto } from '@/lib/review/comment-client'
import { uploadCommentImage, validateImageFile, MAX_ATTACHMENTS, type UploadedAttachment } from '@/lib/review/comment-attachments'
import type { AnnotationController } from './useAnnotation'
import { EmojiPicker } from './EmojiPicker'

const SS_KEY = 'review:composer:isInternal'

interface PendingAttachment {
    localId: string
    file: File
    previewUrl: string
    status: 'uploading' | 'done' | 'error'
    uploaded?: UploadedAttachment
    error?: string
    ctrl?: AbortController
}

export function CommentComposer({
    versionId,
    fps,
    mediaKind,
    playheadFrame,
    durationMs = null,
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
    durationMs?: number | null
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
    const [pickerOpen, setPickerOpen] = useState(false)
    const [attachments, setAttachments] = useState<PendingAttachment[]>([])
    const taRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const localIdRef = useRef(0)

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

    // Revoke any object URLs still held when the composer unmounts.
    const attachRef = useRef<PendingAttachment[]>([])
    attachRef.current = attachments
    useEffect(() => () => attachRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl)), [])

    // Frames are 0-indexed → the last valid frame is totalFrames-1. The playhead can
    // land ON totalFrames at the exact end of the clip (round(sec·fps)), which the
    // server rejects (startFrame/endFrame must be < totalFrames), so clamp every frame
    // we submit or display to a valid index. Null durationMs (missing metadata) = no clamp.
    const maxFrame = durationMs != null && fps ? Math.max(0, frameCount(durationMs, fps) - 1) : null
    const clampFrame = (f: number) => {
        const v = Math.max(0, Math.floor(f))
        return maxFrame != null ? Math.min(v, maxFrame) : v
    }

    // The chip tracks the live playhead until the user starts typing / drawing (which
    // pauses), then freezes at that frame.
    const shownFrame = clampFrame(frozenFrame ?? playheadFrame)

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

    // Apply a new body value + the "first character pauses + freezes the frame" side
    // effect (shared by typing and emoji-insert).
    const applyBody = (next: string) => {
        if (body.length === 0 && next.length > 0 && isVideo) {
            onPauseVideo()
            if (!annoActive) setFrozenFrame(playheadFrame) // keep the draw frame if drawing
        }
        if (next.length === 0 && !annoActive) setFrozenFrame(null)
        setBody(next)
    }

    const insertEmoji = (emoji: string) => {
        const ta = taRef.current
        const start = ta?.selectionStart ?? body.length
        const end = ta?.selectionEnd ?? body.length
        const next = body.slice(0, start) + emoji + body.slice(end)
        applyBody(next)
        requestAnimationFrame(() => {
            const el = taRef.current
            if (!el) return
            el.focus()
            const pos = start + emoji.length
            el.setSelectionRange(pos, pos)
        })
    }

    const startUpload = (localId: string, file: File) => {
        const ctrl = new AbortController()
        setAttachments((prev) =>
            prev.map((a) => (a.localId === localId ? { ...a, status: 'uploading', error: undefined, ctrl } : a)),
        )
        uploadCommentImage(file, ctrl.signal)
            .then((up) =>
                setAttachments((prev) =>
                    prev.map((a) => (a.localId === localId ? { ...a, status: 'done', uploaded: up, ctrl: undefined } : a)),
                ),
            )
            .catch((e) => {
                if (ctrl.signal.aborted) return // removed / retried by the user mid-flight
                setAttachments((prev) =>
                    prev.map((a) =>
                        a.localId === localId
                            ? { ...a, status: 'error', error: e instanceof Error ? e.message : 'Lỗi', ctrl: undefined }
                            : a,
                    ),
                )
            })
    }

    const addFiles = (files: FileList | null) => {
        if (submitting || !files || files.length === 0) return // no adds mid-send
        const room = MAX_ATTACHMENTS - attachments.length
        if (room <= 0) {
            alert(`Tối đa ${MAX_ATTACHMENTS} ảnh mỗi bình luận.`)
            return
        }
        const chosen = Array.from(files).slice(0, room)
        if (files.length > room) alert(`Chỉ thêm được ${room} ảnh nữa (tối đa ${MAX_ATTACHMENTS}).`)
        for (const file of chosen) {
            const err = validateImageFile(file)
            if (err) {
                alert(`${file.name}: ${err}`)
                continue
            }
            const localId = String(++localIdRef.current)
            const previewUrl = URL.createObjectURL(file)
            setAttachments((prev) => [...prev, { localId, file, previewUrl, status: 'uploading' }])
            startUpload(localId, file)
        }
    }

    const retryAttachment = (localId: string) => {
        const a = attachments.find((x) => x.localId === localId)
        if (a) startUpload(localId, a.file)
    }

    const removeAttachment = (localId: string) => {
        setAttachments((prev) => {
            const a = prev.find((x) => x.localId === localId)
            if (a) {
                a.ctrl?.abort()
                URL.revokeObjectURL(a.previewUrl)
            }
            return prev.filter((x) => x.localId !== localId)
        })
    }

    const enableRange = () => {
        onPauseVideo()
        setAttachTime(true)
        const inF = frozenFrame ?? freezeHere()
        setRangeEnd(clampFrame(Math.max(inF + 1, playheadFrame)))
    }
    const captureOut = () => setRangeEnd(clampFrame(Math.max(shownFrame + 1, playheadFrame)))

    const beginDraw = () => {
        onPauseVideo()
        setAttachTime(true)
        const f = frozenFrame ?? freezeHere()
        annotation?.begin(f)
    }

    const doneAttachments = attachments.filter((a): a is PendingAttachment & { uploaded: UploadedAttachment } => a.status === 'done' && !!a.uploaded)
    // Block send while ANY attachment is unresolved (uploading OR errored) — otherwise a
    // failed image would be silently dropped from the payload and wiped on success. The
    // user must retry or remove it first.
    const pendingAttach = attachments.some((a) => a.status !== 'done')
    const canSend =
        (!!body.trim() || (annoActive && annoCount > 0) || doneAttachments.length > 0) && !pendingAttach

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
                attachments: doneAttachments.length ? doneAttachments.map((a) => a.uploaded) : undefined,
                isInternal: isReply ? undefined : isInternal,
            })
            onPosted(comment)
            setBody('')
            setFrozenFrame(null)
            setRangeEnd(null)
            attachRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl)) // latest, not the stale closure
            setAttachments([])
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

            {/* attachment thumbnails */}
            {attachments.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {attachments.map((a) => (
                        <div key={a.localId} className="relative h-14 w-14 overflow-hidden rounded-md border border-white/10">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                            {a.status === 'uploading' && (
                                <div className="absolute inset-0 grid place-items-center bg-black/50">
                                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                                </div>
                            )}
                            {a.status === 'error' && (
                                <button
                                    onClick={() => retryAttachment(a.localId)}
                                    className="absolute inset-0 grid place-items-center bg-red-900/60 hover:bg-red-900/80"
                                    title={`${a.error ?? 'Lỗi'} — bấm để thử lại`}
                                    aria-label="Thử lại"
                                >
                                    <RotateCcw className="h-4 w-4 text-red-100" />
                                </button>
                            )}
                            <button
                                onClick={() => removeAttachment(a.localId)}
                                className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                                aria-label="Xóa ảnh"
                            >
                                <X className="h-2.5 w-2.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-1.5">
                <textarea
                    ref={taRef}
                    value={body}
                    onChange={(e) => applyBody(e.target.value)}
                    onKeyDown={onKeyDown}
                    rows={isReply ? 1 : 2}
                    placeholder={isReply ? 'Trả lời…' : annoActive ? 'Ghi chú cho hình vẽ (tuỳ chọn)…' : 'Thêm bình luận…'}
                    className="min-h-[38px] flex-1 resize-none rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-indigo-400/50 focus:outline-none"
                />

                {/* emoji */}
                <div className="relative">
                    <button
                        type="button"
                        onClick={() => setPickerOpen((v) => !v)}
                        className="grid h-9 w-9 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white/80"
                        aria-label="Chèn emoji"
                    >
                        <Smile className="h-4 w-4" />
                    </button>
                    {pickerOpen && (
                        <EmojiPicker
                            onPick={(e) => {
                                insertEmoji(e)
                                setPickerOpen(false)
                            }}
                            onClose={() => setPickerOpen(false)}
                        />
                    )}
                </div>

                {/* attach image */}
                <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={attachments.length >= MAX_ATTACHMENTS || submitting}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white/80 disabled:opacity-30"
                    aria-label="Đính kèm ảnh"
                    title={`Đính kèm ảnh (tối đa ${MAX_ATTACHMENTS}, mỗi ảnh ≤10MB)`}
                >
                    <ImagePlus className="h-4 w-4" />
                </button>

                {/* send */}
                <button
                    onClick={() => void submit()}
                    disabled={!canSend || submitting}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:opacity-40"
                    aria-label="Gửi"
                >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
            </div>

            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    addFiles(e.target.files)
                    e.target.value = '' // allow re-picking the same file
                }}
            />
        </div>
    )
}
