// [Review module P4.3] The right-panel comment feed: threaded list + composer +
// per-version empty state (FR-E03/E08/E09). Mutations update the SWR cache
// optimistically (via feed.patch) then reconcile from the server response; a failed
// call falls back to feed.refresh(). Sort/filter/search toolbar lands in P4.5.

'use client'

import { useCallback, useMemo, useState } from 'react'
import { MessageSquare, ArrowRightCircle } from 'lucide-react'
import type { Fps } from '@/lib/review/timecode'
import type { CommentDto } from '@/lib/review/comment-client'
import type { CommentsFeed } from './useComments'
import type { AnnotationController } from './useAnnotation'
import type { RangeController } from './useRangeSelection'
import { CommentThread, type CommentActions } from './CommentItem'
import { CommentComposer } from './CommentComposer'
import { usePlayerEnv } from './player-env'
import { PLAYER_L10N } from './player-l10n'

function toggleReactionLocal(reactions: CommentDto['reactions'], emoji: string, add: boolean): CommentDto['reactions'] {
    const idx = reactions.findIndex((r) => r.emoji === emoji)
    if (add) {
        if (idx >= 0) {
            const r = reactions[idx]
            if (r.reactedByMe) return reactions
            const copy = [...reactions]
            copy[idx] = { ...r, count: r.count + 1, reactedByMe: true }
            return copy
        }
        return [...reactions, { emoji, count: 1, reactedByMe: true }]
    }
    if (idx < 0) return reactions
    const r = reactions[idx]
    if (!r.reactedByMe) return reactions
    const next = r.count - 1
    if (next <= 0) return reactions.filter((_, i) => i !== idx)
    const copy = [...reactions]
    copy[idx] = { ...r, count: next, reactedByMe: false }
    return copy
}

export function CommentsPanel({
    versionId,
    fps,
    mediaKind,
    currentUserId,
    isAdmin,
    feed,
    playheadFrame,
    durationMs,
    annotation,
    range = null,
    onSeekToFrame,
    onPauseVideo,
    onFocusPlayer,
    onViewAnnotation,
    onPlayRangeComment,
    onExitRange,
    highlightId,
    onJumpToVersion,
    readOnly = false,
    textOnly = false,
}: {
    versionId: string
    fps: Fps | null
    mediaKind: 'video' | 'image'
    currentUserId: string
    isAdmin: boolean
    feed: CommentsFeed
    playheadFrame: number
    durationMs: number | null
    annotation: AnnotationController | null
    /** [FR-04] shell-owned pending timecode/range for the top-level composer (null for guests-off). */
    range?: RangeController | null
    onSeekToFrame: (frame: number) => void
    onPauseVideo: () => void
    onFocusPlayer: () => void
    onViewAnnotation: (c: CommentDto) => void
    /** [Lỗi 1] Clicking a range comment plays its [in,out] loop. Omitted where there is no
     *  range-playback engine (guest surfaces) → a range comment falls back to a plain seek. */
    onPlayRangeComment?: (c: CommentDto) => void
    /** [Lỗi 1] Leave range-loop mode (point-comment jump). */
    onExitRange?: () => void
    highlightId: string | null
    onJumpToVersion: (versionId: string) => void
    /** P5.3 guest comments-off: render existing public comments but no composer/reply. */
    readOnly?: boolean
    /** [F6/P5 Compare] force the composer text-only (no draw/range/emoji/attach), keep playhead timecode. */
    textOnly?: boolean
}) {
    const env = usePlayerEnv()
    const L = PLAYER_L10N[env.lang]
    const { comments } = feed
    const { patch, refresh } = feed
    const api = env.api

    const { parents, repliesByParent } = useMemo(() => {
        const parents: CommentDto[] = []
        const repliesByParent = new Map<string, CommentDto[]>()
        for (const c of comments) {
            if (c.parentId) {
                const arr = repliesByParent.get(c.parentId) ?? []
                arr.push(c)
                repliesByParent.set(c.parentId, arr)
            } else {
                parents.push(c)
            }
        }
        // Match the server order (timecodeMs asc, nulls first, then createdAt) so an
        // optimistically-added earlier-timecode comment lands in the right slot, not
        // at the bottom until the next poll.
        parents.sort((a, b) => {
            const fa = a.startFrame ?? -1
            const fb = b.startFrame ?? -1
            return fa !== fb ? fa - fb : a.createdAt.localeCompare(b.createdAt)
        })
        for (const arr of repliesByParent.values()) arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        return { parents, repliesByParent }
    }, [comments])

    const actions: CommentActions = useMemo(
        () => ({
            resolve: (id, resolved) => {
                patch((list) =>
                    list.map((c) => (c.id === id ? { ...c, completedAt: resolved ? new Date().toISOString() : null } : c)),
                )
                api.setCommentResolved(id, resolved)
                    .then(({ comment }) => patch((list) => list.map((c) => (c.id === comment.id ? comment : c))))
                    .catch(() => refresh())
            },
            remove: (id) => {
                patch((list) => list.filter((c) => c.id !== id && c.parentId !== id))
                api.deleteComment(id).catch(() => refresh())
            },
            edit: (id, body) => {
                patch((list) => list.map((c) => (c.id === id ? { ...c, body, editedAt: new Date().toISOString() } : c)))
                api.editComment(id, body)
                    .then(({ comment }) => patch((list) => list.map((c) => (c.id === comment.id ? comment : c))))
                    .catch(() => refresh())
            },
            // Reactions: apply the optimistic local delta only. Do NOT reconcile from the
            // single request's full-snapshot response — two rapid toggles on one comment
            // would let the earlier-resolving response clobber the later reaction. The 5s
            // poll reconciles against the server; failures roll back via refresh().
            react: (id, emoji, add) => {
                patch((list) => list.map((c) => (c.id === id ? { ...c, reactions: toggleReactionLocal(c.reactions, emoji, add) } : c)))
                ;(add ? api.addReaction(id, emoji) : api.removeReaction(id, emoji)).catch(() => refresh())
            },
            viewAnnotation: onViewAnnotation,
            playRange: onPlayRangeComment,
            exitRange: onExitRange,
        }),
        [patch, refresh, onViewAnnotation, onPlayRangeComment, onExitRange, api],
    )

    const onPosted = useCallback(
        (c: CommentDto) => {
            patch((list) => (list.some((x) => x.id === c.id) ? list : [...list, c]))
            refresh()
        },
        [patch, refresh],
    )

    const otherWithComments = feed.otherVersions.filter((o) => o.commentCount > 0)
    const otherTotal = otherWithComments.reduce((s, o) => s + o.commentCount, 0)

    /** Default OPEN: the first question either side has is "what's still outstanding". */
    const [onlyOpen, setOnlyOpen] = useState(true)

    /* [Open notes 2026-07] The one thing Frame.io has that this did not.
     *
     * `completedAt` has always been on the DTO and has always reached the guest
     * (dto.ts:292) — a resolved note even renders its tick. But there was no count and no
     * way to filter, so neither side could answer "which of my notes are still
     * outstanding". Worse, confirmFixDone bulk-resolves every open note on an asset in one
     * updateMany (task-sync.ts), so a note nobody addressed can be marked done behind the
     * client's back. A visible open-count is what makes that legible instead of silent.
     *
     * Purely client-side over comments already loaded: no new query, no new endpoint, and
     * it lands for STAFF and CLIENT at once, which is the parity the owner asked for. */
    const openCount = parents.filter((c) => !c.completedAt).length
    const doneCount = parents.length - openCount
    const shown = onlyOpen ? parents.filter((c) => !c.completedAt) : parents

    return (
        <div className="flex h-full flex-col">
            {/* Only worth a toolbar once something HAS been resolved — otherwise "Open" and
                "All" are the same list and the control is just noise. */}
            {doneCount > 0 && (
                <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2">
                    {([true, false] as const).map((v) => (
                        <button
                            key={String(v)}
                            onClick={() => setOnlyOpen(v)}
                            aria-pressed={onlyOpen === v}
                            className={
                                'rounded-full px-2.5 py-1 text-xs transition-colors ' +
                                (onlyOpen === v ? 'bg-primary/25 text-primary-accent' : 'text-white/55 hover:text-white/80')
                            }
                        >
                            {v ? L.filterOpen(openCount) : L.filterAll(parents.length)}
                        </button>
                    ))}
                </div>
            )}
            <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3.5">
                {parents.length > 0 && shown.length === 0 ? (
                    <div className="grid h-full place-items-center px-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-white/55">
                            <MessageSquare className="h-8 w-8 text-white/45" />
                            <p className="text-sm">{L.emptyNoOpen}</p>
                        </div>
                    </div>
                ) : parents.length === 0 ? (
                    <div className="grid h-full place-items-center px-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-white/55">
                            <MessageSquare className="h-8 w-8 text-white/45" />
                            {otherWithComments.length > 0 ? (
                                <>
                                    <p className="text-sm">{L.emptyOtherVersions(otherTotal)}</p>
                                    <button
                                        onClick={() => onJumpToVersion(otherWithComments[0].versionId)}
                                        className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary/20 px-3 py-1.5 text-sm text-primary-accent hover:bg-primary/30"
                                    >
                                        <ArrowRightCircle className="h-4 w-4" />
                                        {L.viewVersion(otherWithComments[0].versionNumber)}
                                    </button>
                                </>
                            ) : (
                                <p className="text-sm">{L.emptyNoComments}</p>
                            )}
                        </div>
                    </div>
                ) : (
                    shown.map((c) => (
                        <CommentThread
                            key={c.id}
                            comment={c}
                            replies={repliesByParent.get(c.id) ?? []}
                            fps={fps}
                            mediaKind={mediaKind}
                            currentUserId={currentUserId}
                            isAdmin={isAdmin}
                            highlighted={highlightId === c.id}
                            playheadFrame={0 /* replies carry no timecode; keep the prop stable so memo holds during playback */}
                            onSeekToFrame={onSeekToFrame}
                            onPauseVideo={onPauseVideo}
                            onFocusPlayer={onFocusPlayer}
                            onReplyPosted={onPosted}
                            actions={actions}
                            canReply={!readOnly}
                        />
                    ))
                )}
            </div>

            {!readOnly && (
                <CommentComposer
                    versionId={versionId}
                    fps={fps}
                    mediaKind={mediaKind}
                    playheadFrame={playheadFrame}
                    durationMs={durationMs}
                    annotation={annotation}
                    range={range}
                    onPauseVideo={onPauseVideo}
                    onPosted={onPosted}
                    onFocusPlayer={onFocusPlayer}
                    textOnly={textOnly}
                />
            )}
        </div>
    )
}
