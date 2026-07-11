// [Review module P2 · FR-04] Pending timecode/range of the comment being composed,
// LIFTED to the player shell so BOTH sides can touch it: the composer (right panel)
// shows the chip + writes the in-point on first keystroke, and the timeline (left, in
// PlayerControls) renders the marker + lets the user DRAG the range directly like
// frame.io. Neither side can reach the other, so the shell owns the state. The upload
// API is unchanged — this only moves client-side interaction (startFrame/endFrame were
// always accepted).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** The pending timecode/range. `active` gates the chip + timeline marker. */
export interface RangeSelection {
    active: boolean
    /** Frozen in-point. null = follow the live playhead (until the user types / drags). */
    inFrame: number | null
    /** Out-point. null = a point comment (no range). */
    outFrame: number | null
}

export interface RangeController extends RangeSelection {
    /** Attach a timecode that follows the live playhead (the "Attach timestamp" button /
     *  the default for a fresh video comment). Resets any frozen in/out. */
    activate: () => void
    /** Freeze the in-point at `frame` if not already frozen (first keystroke / draw / drag). */
    freezeIn: (frame: number) => void
    /** Move the in-point (dragging the in handle); keeps in ≤ out. */
    setIn: (frame: number) => void
    /** Set/clear the out-point (dragging the out handle). null → point comment. */
    setOut: (frame: number | null) => void
    /** Drop the whole timecode (the ✕ on the chip / non-video / version switch). */
    clear: () => void
}

export function useRangeSelection(): RangeController {
    const [active, setActive] = useState(false)
    const [inFrame, setInFrame] = useState<number | null>(null)
    const [outFrame, setOutFrame] = useState<number | null>(null)

    const activate = useCallback(() => {
        setActive(true)
        setInFrame(null)
        setOutFrame(null)
    }, [])
    const freezeIn = useCallback((frame: number) => {
        setActive(true)
        setInFrame((cur) => (cur == null ? frame : cur))
    }, [])
    const setIn = useCallback((frame: number) => {
        setActive(true)
        setInFrame(frame)
        setOutFrame((o) => (o != null && o <= frame ? null : o))
    }, [])
    const setOut = useCallback((frame: number | null) => setOutFrame(frame), [])
    const clear = useCallback(() => {
        setActive(false)
        setInFrame(null)
        setOutFrame(null)
    }, [])

    return { active, inFrame, outFrame, activate, freezeIn, setIn, setOut, clear }
}

/**
 * [FR-04 · range playback, owner-specified] Play [inFrame, outFrame], then STOP at the
 * out-point (never run past the range). Pressing play again REPLAYS within the range
 * (seek back to the in-point) — "dừng ở cuối, bấm play thì lặp lại trong khoảng, cứ thế".
 * Refs (not state) hold the bounds + the at-end latch so the frame-tick effect never
 * churns the caller. `frame`/`isPlaying` are live; `seekToFrame`/`play`/`pause` are the
 * controller's STABLE methods.
 *
 * `stopRange()` disarms it (the shell calls it when the range is cleared/collapsed — the
 * "turn the range off" affordance, together with the ✕ on the timeline marker).
 */
export function useRangePlayback(
    frame: number,
    seekToFrame: (f: number) => void,
    play: () => void,
    pause: () => void,
    isPlaying: boolean,
): { playRange: (inFrame: number, outFrame: number) => void; stopRange: () => void } {
    const loopRef = useRef<{ inFrame: number; outFrame: number } | null>(null)
    const atEndRef = useRef(false) // reached the out-point and paused there
    const wasPlayingRef = useRef(isPlaying)

    const playRange = useCallback(
        (inFrame: number, outFrame: number) => {
            loopRef.current = { inFrame, outFrame }
            atEndRef.current = false
            seekToFrame(inFrame)
            play()
        },
        [seekToFrame, play],
    )
    const stopRange = useCallback(() => {
        loopRef.current = null
        atEndRef.current = false
    }, [])

    // Reaching the out-point PAUSES at the end of the range. The at-end latch clears if
    // the playhead later moves back inside the range (e.g. a manual seek).
    useEffect(() => {
        const loop = loopRef.current
        if (!loop) return
        if (!atEndRef.current && frame >= loop.outFrame) {
            atEndRef.current = true
            pause()
        } else if (atEndRef.current && frame < loop.outFrame - 1) {
            atEndRef.current = false
        }
    }, [frame, pause])

    // Pressing play after the range ended → replay WITHIN the range (seek to in), instead
    // of running past it.
    useEffect(() => {
        const started = isPlaying && !wasPlayingRef.current
        wasPlayingRef.current = isPlaying
        if (started && loopRef.current && atEndRef.current) {
            atEndRef.current = false
            seekToFrame(loopRef.current.inFrame)
        }
    }, [isPlaying, seekToFrame])

    return { playRange, stopRange }
}
