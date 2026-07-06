// [Review module P4.3] One comment thread (parent + 1 level of replies) — PRD
// FR-E03/E08. Timecode chip seeks the player; resolve dims the card; reactions (6
// emoji) toggle; author can edit/delete, admin can delete any. The reply composer
// inherits the parent's visibility (enforced server-side too).

'use client'

import { memo, useEffect, useState } from 'react'
import {
    Lock,
    Clock,
    Check,
    CheckCheck,
    CornerUpLeft,
    Pencil,
    Trash2,
    SmilePlus,
    PenLine,
    ChevronLeft,
    ChevronRight,
    X,
} from 'lucide-react'
import { frameToSmpte, type Fps } from '@/lib/review/timecode'
import type { CommentDto } from '@/lib/review/comment-client'
import { CommentComposer } from './CommentComposer'

type Attachment = CommentDto['attachments'][number]

export const REVIEW_REACTIONS = ['👍', '❤️', '🎉', '😂', '👀', '🙏']

export interface CommentActions {
    resolve: (id: string, resolved: boolean) => void
    remove: (id: string) => void
    edit: (id: string, body: string) => void
    react: (id: string, emoji: string, add: boolean) => void
    viewAnnotation: (c: CommentDto) => void
}

function relTime(iso: string): string {
    const t = new Date(iso).getTime()
    const diff = Date.now() - t
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'vừa xong'
    if (m < 60) return `${m} phút trước`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h} giờ trước`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d} ngày trước`
    try {
        return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })
    } catch {
        return ''
    }
}

function Avatar({ name, url }: { name: string; url: string | null }) {
    if (url)
        // eslint-disable-next-line @next/next/no-img-element
        return <img src={url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
    const initials = name.trim().slice(0, 1).toUpperCase() || '?'
    return (
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-500/25 text-xs font-semibold text-indigo-200">
            {initials}
        </div>
    )
}

function Reactions({
    comment,
    onToggle,
}: {
    comment: CommentDto
    onToggle: (emoji: string, add: boolean) => void
}) {
    const [pickerOpen, setPickerOpen] = useState(false)
    return (
        <div className="mt-1 flex flex-wrap items-center gap-1">
            {comment.reactions.map((r) => (
                <button
                    key={r.emoji}
                    onClick={() => onToggle(r.emoji, !r.reactedByMe)}
                    className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs ${
                        r.reactedByMe
                            ? 'border-indigo-400/50 bg-indigo-500/20 text-white'
                            : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                    }`}
                >
                    <span>{r.emoji}</span>
                    <span className="tabular-nums">{r.count}</span>
                </button>
            ))}
            <div className="relative">
                <button
                    onClick={() => setPickerOpen((v) => !v)}
                    className="grid h-6 w-6 place-items-center rounded-full text-white/40 hover:bg-white/10 hover:text-white/80"
                    aria-label="Thêm cảm xúc"
                >
                    <SmilePlus className="h-3.5 w-3.5" />
                </button>
                {pickerOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                        <div className="absolute bottom-7 left-0 z-20 flex gap-0.5 rounded-lg border border-white/10 bg-zinc-900/95 p-1 shadow-xl">
                            {REVIEW_REACTIONS.map((e) => {
                                const mine = comment.reactions.find((r) => r.emoji === e)?.reactedByMe ?? false
                                return (
                                    <button
                                        key={e}
                                        onClick={() => {
                                            onToggle(e, !mine)
                                            setPickerOpen(false)
                                        }}
                                        className="grid h-7 w-7 place-items-center rounded hover:bg-white/10"
                                    >
                                        {e}
                                    </button>
                                )
                            })}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function SingleComment({
    comment,
    fps,
    onSeekToFrame,
    actions,
    isReply,
}: {
    comment: CommentDto
    fps: Fps | null
    onSeekToFrame: (frame: number) => void
    actions: CommentActions
    isReply?: boolean
}) {
    const authorName = comment.author?.name ?? comment.guest?.name ?? 'Ẩn danh'
    const hasTime = comment.startFrame != null
    const [lightbox, setLightbox] = useState<number | null>(null)

    return (
        <div className="group/comment">
            <div className="flex gap-2">
                <Avatar name={authorName} url={comment.author?.avatarUrl ?? null} />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white/90">{authorName}</span>
                        {comment.isInternal && (
                            <span title="Nội bộ" className="inline-flex">
                                <Lock className="h-3 w-3 shrink-0 text-amber-400" />
                            </span>
                        )}
                        <span className="shrink-0 text-xs text-white/35">{relTime(comment.createdAt)}</span>
                        {comment.editedAt && <span className="text-[10px] text-white/30">(đã sửa)</span>}
                    </div>

                    {/* timecode + annotation chips */}
                    {!isReply && (hasTime || comment.annotation) && (
                        <div className="mt-0.5 flex items-center gap-1.5">
                            {hasTime && (
                                <button
                                    onClick={() => onSeekToFrame(comment.startFrame as number)}
                                    className="flex items-center gap-1 rounded bg-indigo-500/15 px-1.5 py-0.5 font-mono text-[11px] text-indigo-300 hover:bg-indigo-500/25"
                                >
                                    <Clock className="h-3 w-3" />
                                    {fps ? frameToSmpte(comment.startFrame as number, fps) : comment.startFrame}
                                    {comment.endFrame != null && (
                                        <span> – {fps ? frameToSmpte(comment.endFrame, fps) : comment.endFrame}</span>
                                    )}
                                </button>
                            )}
                            {comment.annotation && (
                                <button
                                    onClick={() => actions.viewAnnotation(comment)}
                                    className="flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/50 hover:bg-white/10 hover:text-white/80"
                                    title="Xem hình vẽ trên khung hình"
                                >
                                    <PenLine className="h-3 w-3" /> Hình vẽ
                                </button>
                            )}
                        </div>
                    )}

                    {/* body */}
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-white/80">{comment.body}</p>

                    {/* attachments (thumbnails → lightbox) */}
                    {comment.attachments.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {comment.attachments.map((a, i) => (
                                <button
                                    key={a.id}
                                    onClick={() => setLightbox(i)}
                                    className="h-16 w-16 overflow-hidden rounded-md border border-white/10 transition hover:border-white/30"
                                    aria-label="Xem ảnh"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={a.url} alt="" className="h-full w-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                    {lightbox != null && (
                        <Lightbox
                            images={comment.attachments}
                            index={lightbox}
                            onIndex={setLightbox}
                            onClose={() => setLightbox(null)}
                        />
                    )}

                    <Reactions comment={comment} onToggle={(e, add) => actions.react(comment.id, e, add)} />
                </div>
            </div>
        </div>
    )
}

export const CommentThread = memo(function CommentThread({
    comment,
    replies,
    fps,
    mediaKind,
    currentUserId,
    isAdmin,
    highlighted,
    playheadFrame,
    onSeekToFrame,
    onPauseVideo,
    onFocusPlayer,
    onReplyPosted,
    actions,
}: {
    comment: CommentDto
    replies: CommentDto[]
    fps: Fps | null
    mediaKind: 'video' | 'image'
    currentUserId: string
    isAdmin: boolean
    highlighted: boolean
    playheadFrame: number
    onSeekToFrame: (frame: number) => void
    onPauseVideo: () => void
    onFocusPlayer: () => void
    onReplyPosted: (c: CommentDto) => void
    actions: CommentActions
}) {
    const [replying, setReplying] = useState(false)
    const [editingTop, setEditingTop] = useState(false)
    const resolved = comment.completedAt != null
    const isMine = !!comment.author && comment.author.id === currentUserId
    const canDelete = isMine || isAdmin

    return (
        <div
            id={`comment-${comment.id}`}
            className={`rounded-xl border px-2.5 py-2 transition ${
                highlighted ? 'border-indigo-400/60 bg-indigo-500/10' : 'border-transparent hover:bg-white/[0.03]'
            } ${resolved ? 'opacity-55' : ''}`}
        >
            <SingleComment comment={comment} fps={fps} onSeekToFrame={onSeekToFrame} actions={actions} />

            {/* action row */}
            <div className="mt-1 flex items-center gap-1 pl-9 text-white/40">
                <button
                    onClick={() => setReplying((v) => !v)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/10 hover:text-white/80"
                >
                    <CornerUpLeft className="h-3 w-3" /> Trả lời
                </button>
                <button
                    onClick={() => actions.resolve(comment.id, !resolved)}
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/10 ${
                        resolved ? 'text-emerald-400' : 'hover:text-white/80'
                    }`}
                >
                    {resolved ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                    {resolved ? 'Đã xử lý' : 'Đánh dấu xử lý'}
                </button>
                {isMine && (
                    <button
                        onClick={() => setEditingTop(true)}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-white/10 hover:text-white/80"
                    >
                        <Pencil className="h-3 w-3" /> Sửa
                    </button>
                )}
                {canDelete && (
                    <button
                        onClick={() => {
                            if (confirm('Xóa bình luận này?')) actions.remove(comment.id)
                        }}
                        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-red-500/15 hover:text-red-300"
                    >
                        <Trash2 className="h-3 w-3" /> Xóa
                    </button>
                )}
            </div>

            {/* inline edit for top-level (kept separate so the action row can trigger it) */}
            {editingTop && (
                <InlineEdit
                    initial={comment.body}
                    onCancel={() => setEditingTop(false)}
                    onSave={(b) => {
                        actions.edit(comment.id, b)
                        setEditingTop(false)
                    }}
                />
            )}

            {/* replies */}
            {replies.length > 0 && (
                <div className="mt-1.5 space-y-2 border-l border-white/5 pl-3">
                    {replies.map((r) => (
                        <div key={r.id} className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                                <SingleComment comment={r} fps={fps} onSeekToFrame={onSeekToFrame} actions={actions} isReply />
                            </div>
                            {(!!r.author && r.author.id === currentUserId) || isAdmin ? (
                                <button
                                    onClick={() => {
                                        if (confirm('Xóa trả lời này?')) actions.remove(r.id)
                                    }}
                                    className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded text-white/30 opacity-0 hover:bg-red-500/15 hover:text-red-300 group-hover/comment:opacity-100"
                                    aria-label="Xóa"
                                >
                                    <X className="h-3.5 w-3.5" />
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            )}

            {replying && (
                <CommentComposer
                    versionId={comment.versionId}
                    fps={fps}
                    mediaKind={mediaKind}
                    playheadFrame={playheadFrame}
                    onPauseVideo={onPauseVideo}
                    onFocusPlayer={onFocusPlayer}
                    parentId={comment.id}
                    parentIsInternal={comment.isInternal}
                    autoFocus
                    onPosted={(c) => {
                        onReplyPosted(c)
                        setReplying(false)
                    }}
                    onCancel={() => setReplying(false)}
                />
            )}
        </div>
    )
})

function InlineEdit({ initial, onSave, onCancel }: { initial: string; onSave: (b: string) => void; onCancel: () => void }) {
    const [draft, setDraft] = useState(initial)
    return (
        <div className="mt-1 pl-9">
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-lg border border-white/10 bg-zinc-900/60 px-2.5 py-1.5 text-sm text-white focus:border-indigo-400/50 focus:outline-none"
            />
            <div className="mt-1 flex gap-1.5">
                <button
                    onClick={() => draft.trim() && onSave(draft.trim())}
                    className="rounded-md bg-indigo-500 px-2.5 py-1 text-xs text-white hover:bg-indigo-400"
                >
                    Lưu
                </button>
                <button onClick={onCancel} className="rounded-md px-2.5 py-1 text-xs text-white/60 hover:bg-white/10">
                    Hủy
                </button>
            </div>
        </div>
    )
}

// Full-screen image viewer for comment attachments. `fixed inset-0` escapes the
// scrollable panel; a CAPTURE-phase keydown listener handles Esc/←/→ and
// stopPropagation()s so the player's own arrow/space handler doesn't also fire.
function Lightbox({
    images,
    index,
    onIndex,
    onClose,
}: {
    images: Attachment[]
    index: number
    onIndex: (i: number) => void
    onClose: () => void
}) {
    const count = images.length
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                e.preventDefault()
                onClose()
            } else if (e.key === 'ArrowLeft' && count > 1) {
                e.stopPropagation()
                e.preventDefault()
                onIndex((index - 1 + count) % count)
            } else if (e.key === 'ArrowRight' && count > 1) {
                e.stopPropagation()
                e.preventDefault()
                onIndex((index + 1) % count)
            }
        }
        window.addEventListener('keydown', onKey, { capture: true })
        return () => window.removeEventListener('keydown', onKey, { capture: true })
    }, [index, count, onIndex, onClose])

    const img = images[index]
    if (!img) return null
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" onClick={onClose}>
            <button
                onClick={onClose}
                className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                aria-label="Đóng"
            >
                <X className="h-5 w-5" />
            </button>
            {count > 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onIndex((index - 1 + count) % count)
                    }}
                    className="absolute left-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Ảnh trước"
                >
                    <ChevronLeft className="h-6 w-6" />
                </button>
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={img.url}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className="max-h-[90vh] max-w-[90vw] object-contain"
            />
            {count > 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation()
                        onIndex((index + 1) % count)
                    }}
                    className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Ảnh sau"
                >
                    <ChevronRight className="h-6 w-6" />
                </button>
            )}
            {count > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white/90 tabular-nums">
                    {index + 1} / {count}
                </div>
            )}
        </div>
    )
}
