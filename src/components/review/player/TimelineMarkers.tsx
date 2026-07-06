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
    const dots = comments.filter((c) => c.parentId == null && c.startFrame != null)

    return (
        <>
            {dots.map((c) => {
                const t = (c.startFrame as number) / f
                const left = Math.min(100, Math.max(0, (t / durationSec) * 100))
                const resolved = c.completedAt != null
                const color = resolved
                    ? 'bg-emerald-400/60'
                    : c.isInternal
                      ? 'bg-amber-400'
                      : 'bg-indigo-400'
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
