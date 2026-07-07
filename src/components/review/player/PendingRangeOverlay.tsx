// [Review module P2 · FR-04] The IN-PROGRESS comment's timecode/range drawn ON the
// playbar, frame.io-style. Rendered as part of `timelineChildren` so it lives in the
// exact same coordinate space as TimelineMarkers — VideoStage/PlayerControls stay
// untouched. The layer is pointer-events-none (so hover-scrub + seek still work
// everywhere) EXCEPT the drag handles, which stopPropagation so a handle drag never
// also seeks. Dragging the single "create" handle sideways spawns the range; once a
// range exists, both ends get their own handle. A ▶ on the bar plays just the range.

'use client'

import { useRef } from 'react'
import { Play } from 'lucide-react'
import { fpsFloat, type Fps } from '@/lib/review/timecode'
import type { RangeController } from './useRangeSelection'
import { usePlayerEnv } from './player-env'
import { PLAYER_L10N } from './player-l10n'

export function PendingRangeOverlay({
    range,
    fps,
    durationSec,
    playheadFrame,
    onPlayRange,
}: {
    range: RangeController
    fps: Fps | null
    durationSec: number
    playheadFrame: number
    /** [FR-04] range-playback: seek to in-point + play, auto-pause at out-point. */
    onPlayRange: (inFrame: number, outFrame: number) => void
}) {
    const L = PLAYER_L10N[usePlayerEnv().lang]
    const layerRef = useRef<HTMLDivElement>(null)
    const draggingRef = useRef<'in' | 'out' | null>(null)

    // A timecode must be attached, and we need fps + a duration to place anything.
    if (!range.active || !fps || durationSec <= 0) return null

    const f = fpsFloat(fps)
    const totalFrames = Math.max(1, Math.round(durationSec * f))
    const clampF = (fr: number) => Math.min(totalFrames - 1, Math.max(0, Math.round(fr)))
    const inF = clampF(range.inFrame ?? playheadFrame)
    const outF = range.outFrame != null ? clampF(range.outFrame) : null
    const hasRange = outF != null && outF > inF
    const pct = (fr: number) => Math.min(100, Math.max(0, (fr / f / durationSec) * 100))

    const frameFromClientX = (clientX: number): number => {
        const el = layerRef.current
        if (!el) return inF
        const r = el.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (clientX - r.left) / (r.width || 1)))
        return clampF(ratio * durationSec * f)
    }

    const apply = (which: 'in' | 'out', clientX: number) => {
        const fr = frameFromClientX(clientX)
        const curIn = clampF(range.inFrame ?? playheadFrame)
        if (which === 'out') {
            // Drag the out handle left of / onto the in-point → collapse back to a point.
            range.setOut(fr > curIn ? fr : null)
        } else {
            range.setIn(outF != null ? Math.min(fr, outF) : fr)
        }
    }

    const onDown = (which: 'in' | 'out') => (e: React.PointerEvent) => {
        e.preventDefault()
        e.stopPropagation()
        ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
        draggingRef.current = which
        // Starting to drag the out handle from a point → freeze the in-point first so the
        // range anchors where the playhead was, not wherever the video drifts to.
        if (which === 'out' && range.inFrame == null) range.freezeIn(inF)
        apply(which, e.clientX)
    }
    const onMove = (e: React.PointerEvent) => {
        if (!draggingRef.current) return
        apply(draggingRef.current, e.clientX)
    }
    const onUp = (e: React.PointerEvent) => {
        if (!draggingRef.current) return
        draggingRef.current = null
        try {
            ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
        } catch {
            /* ignore */
        }
    }

    const handleBase =
        'pointer-events-auto absolute top-1/2 z-[3] h-5 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-emerald-300 ring-1 ring-black/50 shadow transition hover:bg-emerald-200'

    return (
        <div ref={layerRef} className="pointer-events-none absolute inset-0">
            {/* filled range bar */}
            {hasRange && (
                <div
                    className="absolute top-1/2 z-[2] h-1.5 -translate-y-1/2 rounded-full bg-emerald-400/60"
                    style={{ left: `${pct(inF)}%`, width: `${Math.max(0.5, pct(outF!) - pct(inF))}%` }}
                />
            )}

            {hasRange ? (
                <>
                    {/* in handle */}
                    <div
                        role="slider"
                        aria-label={L.rangeStartHandle}
                        aria-valuenow={inF}
                        tabIndex={0}
                        className={handleBase}
                        style={{ left: `${pct(inF)}%` }}
                        onPointerDown={onDown('in')}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                    />
                    {/* out handle */}
                    <div
                        role="slider"
                        aria-label={L.rangeEndHandle}
                        aria-valuenow={outF!}
                        tabIndex={0}
                        className={handleBase}
                        style={{ left: `${pct(outF!)}%` }}
                        onPointerDown={onDown('out')}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                    />
                    {/* play-range ▶ (centred above the bar) */}
                    <button
                        type="button"
                        aria-label={L.playRange}
                        title={L.playRange}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                            e.stopPropagation()
                            onPlayRange(inF, outF!)
                        }}
                        className="pointer-events-auto absolute bottom-full z-[4] mb-1 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-emerald-400 text-black shadow ring-1 ring-black/40 hover:bg-emerald-300"
                        style={{ left: `${(pct(inF) + pct(outF!)) / 2}%` }}
                    >
                        <Play className="h-3 w-3" />
                    </button>
                </>
            ) : (
                // No range yet → a single "create" handle at the in-point. Drag it sideways
                // to spawn the range (drag directly on the timeline, per FR-04).
                <div
                    role="slider"
                    aria-label={L.rangeCreateHandle}
                    aria-valuenow={inF}
                    tabIndex={0}
                    title={L.rangeCreateHandle}
                    className={handleBase}
                    style={{ left: `${pct(inF)}%` }}
                    onPointerDown={onDown('out')}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                />
            )}
        </div>
    )
}
