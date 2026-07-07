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
 * [FR-04] Range playback: play [inFrame, outFrame] once, then pause at the out-point.
 * A ref (not state) holds the stop frame so the frame-tick effect doesn't churn the
 * caller. `frame` is the live playhead; the other three are the controller's STABLE
 * methods, so this never re-subscribes on every frame.
 */
export function useRangePlayback(
    frame: number,
    seekToFrame: (f: number) => void,
    play: () => void,
    pause: () => void,
): (inFrame: number, outFrame: number) => void {
    const stopAtRef = useRef<number | null>(null)
    const playRange = useCallback(
        (inFrame: number, outFrame: number) => {
            stopAtRef.current = outFrame
            seekToFrame(inFrame)
            play()
        },
        [seekToFrame, play],
    )
    useEffect(() => {
        if (stopAtRef.current != null && frame >= stopAtRef.current) {
            stopAtRef.current = null
            pause()
        }
    }, [frame, pause])
    return playRange
}
