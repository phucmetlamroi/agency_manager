// [Review module P2 · FR-04] The IN-PROGRESS comment's timecode/range drawn ON the
// playbar, frame.io-style. Rendered as part of `timelineChildren` so it lives in the
// exact same coordinate space as TimelineMarkers. The layer is pointer-events-none
// (so hover-scrub + seek still work everywhere) EXCEPT the range itself and its
// handles. Dragging a handle scrubs the video to preview the frame under the cursor
// and snaps the range on release; the filled range LOOPS playback within it; a ✕
// removes the range entirely (the "turn it off" affordance).

'use client'

import { useRef } from 'react'
import { X } from 'lucide-react'
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
    onScrubFrame,
}: {
    range: RangeController
    fps: Fps | null
    durationSec: number
    playheadFrame: number
    /** [FR-04] range-playback: seek to in-point + play, LOOP within [in,out]. */
    onPlayRange: (inFrame: number, outFrame: number) => void
    /** While dragging a handle, seek the video so the frame under the cursor previews
     *  live (frame.io feel). The marker follows the cursor and "snaps" on release. */
    onScrubFrame?: (frame: number) => void
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
        // Live preview: scrub the video to the frame under the dragged handle.
        onScrubFrame?.(fr)
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

    const onHandleKeyDown = (which: 'in' | 'out') => (e: React.KeyboardEvent) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        e.stopPropagation()
        const delta = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1)
        if (which === 'in') {
            range.setIn(clampF(inF + delta))
            return
        }
        if (range.inFrame == null) range.freezeIn(inF)
        const next = clampF((outF ?? inF) + delta)
        range.setOut(next > inF ? next : null)
    }

    // Slim frame.io-style handle: a generous invisible hit area (w-3) wrapping a thin
    // ~3px violet needle, replacing the old chunky 12px block. rounded wrapper carries
    // the focus ring.
    const handleWrap =
        'group/handle pointer-events-auto absolute top-1/2 z-[4] flex h-6 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white'
    const handleNeedle =
        'h-4 w-[3px] rounded-full bg-violet-300 shadow-[0_0_0_1px_rgba(17,18,20,0.72)] transition group-hover/handle:bg-violet-200'

    return (
        <div ref={layerRef} className="pointer-events-none absolute inset-0">
            {/* filled range bar — click to LOOP playback within it */}
            {hasRange && (
                <button
                    type="button"
                    aria-label={L.playRange}
                    title={L.playRange}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation()
                        onPlayRange(inF, outF!)
                    }}
                    className="pointer-events-auto absolute top-1/2 z-[2] h-2 -translate-y-1/2 rounded-full bg-violet-400/70 shadow-[0_0_10px_rgba(167,139,250,0.5)] transition hover:h-2.5 hover:bg-violet-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{ left: `${pct(inF)}%`, width: `${Math.max(0.5, pct(outF!) - pct(inF))}%` }}
                />
            )}

            {/* ✕ remove the range (turn it off) — floats just above the rail at the range midpoint */}
            {hasRange && (
                <button
                    type="button"
                    aria-label={L.removeRange}
                    title={L.removeRange}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation()
                        range.clear()
                    }}
                    className="pointer-events-auto absolute bottom-[calc(100%+2px)] z-[5] grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full bg-[#12141a] text-white/85 shadow-[0_1px_4px_rgba(0,0,0,0.5)] ring-1 ring-white/25 transition hover:bg-red-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    style={{ left: `${(pct(inF) + pct(outF!)) / 2}%` }}
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            )}

            {hasRange ? (
                <>
                    {/* in handle */}
                    <div
                        role="slider"
                        aria-label={L.rangeStartHandle}
                        aria-valuemin={0}
                        aria-valuemax={totalFrames - 1}
                        aria-valuenow={inF}
                        tabIndex={0}
                        className={handleWrap}
                        style={{ left: `${pct(inF)}%` }}
                        onPointerDown={onDown('in')}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        onKeyDown={onHandleKeyDown('in')}
                    >
                        <span className={handleNeedle} />
                    </div>
                    {/* out handle */}
                    <div
                        role="slider"
                        aria-label={L.rangeEndHandle}
                        aria-valuemin={0}
                        aria-valuemax={totalFrames - 1}
                        aria-valuenow={outF!}
                        tabIndex={0}
                        className={handleWrap}
                        style={{ left: `${pct(outF!)}%` }}
                        onPointerDown={onDown('out')}
                        onPointerMove={onMove}
                        onPointerUp={onUp}
                        onPointerCancel={onUp}
                        onKeyDown={onHandleKeyDown('out')}
                    >
                        <span className={handleNeedle} />
                    </div>
                </>
            ) : (
                // No range yet → a single "create" handle at the in-point. Drag it sideways
                // to spawn the range (drag directly on the timeline, per FR-04).
                <div
                    role="slider"
                    aria-label={L.rangeCreateHandle}
                    aria-valuemin={0}
                    aria-valuemax={totalFrames - 1}
                    aria-valuenow={inF}
                    tabIndex={0}
                    title={L.rangeCreateHandle}
                    className={handleWrap}
                    style={{ left: `${pct(inF)}%` }}
                    onPointerDown={onDown('out')}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                    onKeyDown={onHandleKeyDown('out')}
                >
                    <span className={handleNeedle} />
                </div>
            )}
        </div>
    )
}
