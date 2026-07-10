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
import { Lock, Globe, Clock, X, Loader2, Send, PenLine, Smile, ImagePlus, RotateCcw } from 'lucide-react'
import { frameToSmpte, frameCount, type Fps } from '@/lib/review/timecode'
import type { CommentDto } from '@/lib/review/comment-client'
import { uploadCommentImage, validateImageFile, MAX_ATTACHMENTS, type UploadedAttachment } from '@/lib/review/comment-attachments'
import type { AnnotationController } from './useAnnotation'
import type { RangeController } from './useRangeSelection'
import { EmojiPicker } from './EmojiPicker'
import { usePlayerEnv } from './player-env'
import { PLAYER_L10N } from './player-l10n'

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
    range = null,
    parentId = null,
    parentIsInternal,
    autoFocus = false,
    onCancel,
    textOnly = false,
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
    /** [FR-04] Shell-owned pending timecode/range (top-level video comments only). The
     *  timeline (left) and this composer (right) both read/write it. Absent for replies
     *  / images → no timecode UI. */
    range?: RangeController | null
    parentId?: string | null
    parentIsInternal?: boolean
    autoFocus?: boolean
    onCancel?: () => void
    /** [F6/P5 Compare] Text-only mode: no draw/range/emoji/attachment UI, but the comment
     *  STILL attaches to the current playhead so it stays click-to-seek. Used by CompareView. */
    textOnly?: boolean
}) {
    const env = usePlayerEnv()
    const L = PLAYER_L10N[env.lang]
    const isReply = parentId != null
    const isVideo = mediaKind === 'video'
    const canAnnotate = !isReply && isVideo && annotation != null && !textOnly
    // [FR-04] The timecode/range lives in the shell (so the timeline can edit it too).
    // Only top-level video comments get it; replies / images have no timecode UI.
    // [F6] textOnly suppresses the range UI but keeps the playhead-attached timecode.
    const hasRange = !isReply && isVideo && range != null && !textOnly
    const [body, setBody] = useState('')
    const [isInternal, setIsInternal] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [pickerOpen, setPickerOpen] = useState(false)
    const [attachments, setAttachments] = useState<PendingAttachment[]>([])
    const taRef = useRef<HTMLTextAreaElement>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const localIdRef = useRef(0)

    const annoActive = canAnnotate && annotation!.active
    const annoCount = annotation?.shapes.length ?? 0
    // Annotation is pinned to a frame → force the timecode on while drawing.
    // [F6] textOnly always attaches to the playhead (so compare comments stay seekable).
    const timeAttached = textOnly ? isVideo && !isReply : hasRange && (range!.active || annoActive)
    const rangeOut = range?.outFrame ?? null

    // [FR-04] A fresh top-level video comment starts with the timecode attached (following
    // the live playhead); switching version resets it. Non-video / replies get no timecode.
    // Cleanup clears the pending marker when the composer unmounts (e.g. switching to the
    // Info tab) so a stale range bar can't linger on the always-visible timeline.
    useEffect(() => {
        if (isReply) return
        if (hasRange && isVideo) range!.activate()
        else range?.clear()
        return () => range?.clear()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [versionId])

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

    // The chip tracks the live playhead until the user starts typing / drawing / drags a
    // range handle (which freezes the in-point). State lives in the shell (`range`).
    const shownFrame = clampFrame(range?.inFrame ?? playheadFrame)

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

    // Apply a new body value + the "first character pauses + freezes the frame" side
    // effect (shared by typing and emoji-insert).
    const applyBody = (next: string) => {
        if (body.length === 0 && next.length > 0 && isVideo) {
            onPauseVideo()
            if (hasRange && !annoActive) range!.freezeIn(playheadFrame) // keep the draw frame if drawing
        }
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
        uploadCommentImage(file, ctrl.signal, env.api.initiateAttachment)
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
                            ? { ...a, status: 'error', error: e instanceof Error ? e.message : L.uploadError, ctrl: undefined }
                            : a,
                    ),
                )
            })
    }

    const addFiles = (files: FileList | null) => {
        if (submitting || !files || files.length === 0) return // no adds mid-send
        const room = MAX_ATTACHMENTS - attachments.length
        if (room <= 0) {
            alert(L.maxImages(MAX_ATTACHMENTS))
            return
        }
        const chosen = Array.from(files).slice(0, room)
        if (files.length > room) alert(L.roomLeft(room, MAX_ATTACHMENTS))
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

    // [FR-04] The In–Out range is now dragged directly on the timeline (PendingRangeOverlay)
    // — no more "Khoảng"/"Đặt cuối" chips. The composer only freezes the in-point + shows it.
    const beginDraw = () => {
        onPauseVideo()
        const f = range?.inFrame ?? playheadFrame
        range?.freezeIn(f)
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
                startFrame != null && rangeOut != null && rangeOut > startFrame ? clampFrame(rangeOut) : null
            const shapes = annoActive && annoCount > 0 ? annotation!.shapes : undefined
            const { comment } = await env.api.createComment(versionId, {
                body: text || undefined,
                parentId: isReply ? parentId : undefined,
                startFrame,
                endFrame,
                annotation: shapes,
                attachments: doneAttachments.length ? doneAttachments.map((a) => a.uploaded) : undefined,
                // Guests may not send isInternal at all (the guest schema is .strict()
                // and the server forces public anyway).
                isInternal: isReply || !env.can.internalToggle ? undefined : isInternal,
            })
            onPosted(comment)
            setBody('')
            // Reset the pending range but KEEP whether a timecode is attached (the old
            // attachTime persisted across posts): re-arm following the playhead if it was on.
            if (range?.active) range.activate()
            else range?.clear()
            attachRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl)) // latest, not the stale closure
            setAttachments([])
            annotation?.reset()
            if (isReply) onCancel?.()
            else onFocusPlayer()
        } catch (e) {
            // surface minimally; the poll will reconcile if it actually landed
            alert(e instanceof Error ? e.message : L.sendFailed)
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
        <div className={isReply ? 'pl-9 pr-1 pt-1' : 'border-t border-white/[0.12] bg-[#171a1f] p-3 shadow-[0_-8px_20px_rgba(0,0,0,0.14)]'}>
            {/* [B8/FR-05] meta row: timecode chip (left) + visibility toggle (anchored right).
                NO flex-wrap + the toggle's ml-auto slot is FIXED, so the toggle can't hop
                lines when the chip appears/disappears. The In–Out range chips are gone —
                the range is dragged straight on the timeline (FR-04); the draw button moved
                down to the action row so this row's width never changes the toggle position. */}
            {!isReply && ((isVideo && (hasRange || textOnly)) || env.can.internalToggle) && (
                <div className="mb-1.5 flex items-center gap-1.5">
                    {/* [F6] text-only comments carry the current playhead as a read-only timecode. */}
                    {isVideo && textOnly && (
                        <span className="flex min-w-0 items-center gap-1 rounded-md border border-violet-300/20 bg-violet-400/[0.12] px-2 py-1 text-xs font-medium text-violet-200">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span className="font-mono tabular-nums">{smpte(shownFrame)}</span>
                        </span>
                    )}
                    {isVideo &&
                        hasRange &&
                        (timeAttached ? (
                            <span className="flex min-w-0 items-center gap-1 rounded-md border border-violet-300/20 bg-violet-400/[0.12] px-2 py-1 text-xs font-medium text-violet-200">
                                <Clock className="h-3 w-3 shrink-0" />
                                <span className="font-mono tabular-nums">{smpte(shownFrame)}</span>
                                {rangeOut != null && rangeOut > shownFrame && (
                                    <span className="font-mono tabular-nums text-primary-accent/80"> – {smpte(clampFrame(rangeOut))}</span>
                                )}
                                {!annoActive && (
                                    <button
                                        onClick={() => range!.clear()}
                                        className="shrink-0 opacity-50 hover:opacity-100"
                                        title={L.dropTime}
                                        aria-label={L.dropTime}
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </span>
                        ) : (
                            <button
                                onClick={() => range!.activate()}
                                className="flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/50 hover:text-white/80"
                            >
                                <Clock className="h-3 w-3" /> {L.attachTime}
                            </button>
                        ))}

                    {env.can.internalToggle && (
                        <button
                            onClick={() => setInternalPersist(!isInternal)}
                            className={`ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                                isInternal ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                            }`}
                            title={isInternal ? L.internalOnTitle : L.internalOffTitle}
                        >
                            {isInternal ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                            {isInternal ? L.internalOn : L.internalOff}
                        </button>
                    )}
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
                                    title={`${a.error ?? L.uploadError} — ${L.retryUpload}`}
                                    aria-label={L.retry}
                                >
                                    <RotateCcw className="h-4 w-4 text-red-100" />
                                </button>
                            )}
                            <button
                                onClick={() => removeAttachment(a.localId)}
                                className="absolute right-0.5 top-0.5 grid h-4 w-4 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                                aria-label={L.removeImage}
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
                    placeholder={isReply ? L.placeholderReply : annoActive ? L.placeholderDrawing : L.placeholder}
                    className="min-h-[42px] flex-1 resize-none rounded-md border border-white/[0.16] bg-[#0d0f13] px-3 py-2 text-sm text-white placeholder:text-white/45 shadow-inner focus:border-violet-300/70 focus:outline-none focus:ring-2 focus:ring-violet-400/20"
                />

                {/* [FR-05] draw button lives in the action row now (kept out of the meta row
                    so it never nudges the visibility toggle) */}
                {canAnnotate && (
                    <button
                        type="button"
                        onClick={annoActive ? () => annotation!.reset() : beginDraw}
                        className={`relative grid h-9 w-9 shrink-0 place-items-center rounded-lg transition ${
                            annoActive ? 'bg-violet-500 text-white shadow-[0_4px_12px_rgba(124,58,237,0.28)]' : 'border border-white/[0.12] bg-white/[0.04] text-white/65 hover:border-white/[0.22] hover:bg-white/[0.10] hover:text-white'
                        }`}
                        title={annoActive ? L.drawExitTitle : L.drawTitle}
                        aria-label={L.draw}
                    >
                        <PenLine className="h-4 w-4" />
                        {annoActive && annoCount > 0 && (
                            <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-primary-accent">
                                {annoCount}
                            </span>
                        )}
                    </button>
                )}

                {/* emoji + attach image — hidden in [F6] text-only compare mode */}
                {!textOnly && (
                    <>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setPickerOpen((v) => !v)}
                                className="grid h-9 w-9 place-items-center rounded-md border border-white/[0.10] bg-white/[0.03] text-white/65 transition hover:border-white/[0.20] hover:bg-white/[0.10] hover:text-white"
                                aria-label={L.insertEmoji}
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

                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={attachments.length >= MAX_ATTACHMENTS || submitting}
                            className="grid h-9 w-9 place-items-center rounded-md border border-white/[0.10] bg-white/[0.03] text-white/65 transition hover:border-white/[0.20] hover:bg-white/[0.10] hover:text-white disabled:opacity-30"
                            aria-label={L.attachImage}
                            title={L.attachImageTitle(MAX_ATTACHMENTS)}
                        >
                            <ImagePlus className="h-4 w-4" />
                        </button>
                    </>
                )}

                {/* send */}
                <button
                    onClick={() => void submit()}
                    disabled={!canSend || submitting}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-violet-500 text-white shadow-[0_5px_14px_rgba(124,58,237,0.32)] transition hover:bg-violet-400 disabled:opacity-35"
                    aria-label={L.send}
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
