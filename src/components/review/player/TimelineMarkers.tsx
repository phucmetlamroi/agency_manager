// [Review module P4.3] Comment markers on the playbar (PRD FR-E03). One dot per
// timecoded top-level comment; click seeks + highlights the card. Internal comments
// are amber, resolved dimmed, public indigo. (Clustering of dense markers is a P6
// refinement — for now they simply overlap.)

'use client'

import { fpsFloat, type Fps } from '@/lib/review/timecode'
import type { CommentDto } from '@/lib/review/comment-client'

export function TimelineMarkers({
    comments,
    fps,
    durationSec,
    onSeek,
    onHighlight,
}: {
    comments: CommentDto[]
    fps: Fps | null
    durationSec: number
    onSeek: (frame: number) => void
    onHighlight: (id: string) => void
}) {
    if (!fps || durationSec <= 0) return null
    const f = fpsFloat(fps)
    const pct = (frame: number) => Math.min(100, Math.max(0, (frame / f / durationSec) * 100))
    const dots = comments.filter((c) => c.parentId == null && c.startFrame != null)

    return (
        <>
            {/* range spans sit under the dots so a dot is always clickable on top */}
            {dots
                .filter((c) => c.endFrame != null && (c.endFrame as number) > (c.startFrame as number))
                .map((c) => {
                    const left = pct(c.startFrame as number)
                    const right = pct(c.endFrame as number)
                    const resolved = c.completedAt != null
                    const bar = resolved ? 'bg-emerald-400/40' : c.isInternal ? 'bg-amber-400/40' : 'bg-primary/40'
                    return (
                        <div
                            key={`r-${c.id}`}
                            className={`pointer-events-none absolute top-1/2 z-0 h-1.5 -translate-y-1/2 rounded-full ${bar}`}
                            style={{ left: `${left}%`, width: `${Math.max(0.5, right - left)}%` }}
                        />
                    )
                })}
            {dots.map((c) => {
                const left = pct(c.startFrame as number)
                const resolved = c.completedAt != null
                const color = resolved
                    ? 'bg-emerald-400/60'
                    : c.isInternal
                      ? 'bg-amber-400'
                      : 'bg-primary'
                return (
                    <button
                        key={c.id}
                        onClick={(e) => {
                            e.stopPropagation()
                            onSeek(c.startFrame as number)
                            onHighlight(c.id)
                        }}
                        className={`absolute top-1/2 z-[1] h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-1 ring-black/50 transition hover:scale-125 ${color}`}
                        style={{ left: `${left}%` }}
                        title={c.body.slice(0, 60)}
                        aria-label="Đi tới bình luận"
                    />
                )
            })}
        </>
    )
}
