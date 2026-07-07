// [review-fixes P5 / FR-06] Synced transport for Compare Version (F6). One transport
// STATE (playing + rate) owns two <video> elements as PURE FOLLOWERS: the shared UI
// controls mutate state → both videos; the videos NEVER feed events back into state
// EXCEPT stall ('waiting') and 'ended' (MASTER-DOSSIER §1.4). That one-way rule is what
// makes an echo-loop structurally impossible (the classic two-video-sync failure mode).
//
// Side A (left) is the drift REFERENCE. A 500ms interval — running ONLY while both play —
// nudges B toward A across 3 thresholds; a stall on either side pauses the other but keeps
// the user's play intent. Seeks are always in SECONDS (the two versions may have different
// fps; frames are display-only) and never use fastSeek (loses precision).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

// Drift-correction constants (MASTER-DOSSIER §1.4 / research B §C).
const EPS = 0.05 // below perception → leave alone
const HARD = 0.5 // ≥ this → hard-seek the follower to the reference
const CATCHUP = 1.05 // ease factor for the lagging side
const TICK = 500 // ms between drift checks

export interface SyncedTransport {
    playing: boolean
    rate: number
    /** Which side is currently buffering (its partner is paused waiting for it), or null. */
    stalledSide: 'a' | 'b' | null
    play: () => void
    pause: () => void
    toggle: () => void
    /** Seek BOTH videos to the same wall-clock second (clamped per-side to its own duration). */
    seekBoth: (sec: number) => void
    setRate: (r: number) => void
}

export function useSyncedTransport(opts: {
    refA: React.RefObject<HTMLVideoElement | null>
    refB: React.RefObject<HTMLVideoElement | null>
    /** Both players attached + READY — gates play (a not-ready side can't start). */
    bothReady: boolean
}): SyncedTransport {
    const { refA, refB, bothReady } = opts
    const [playing, setPlaying] = useState(false)
    const [rate, setRateState] = useState(1)
    const [stalledSide, setStalledSide] = useState<'a' | 'b' | null>(null)

    // Refs mirror state for use inside DOM event listeners / the interval (no stale closures).
    const playingRef = useRef(false)
    playingRef.current = playing
    const rateRef = useRef(1)
    rateRef.current = rate
    const seekingRef = useRef(false) // a programmatic seek (manual or hard-correct) is in flight
    // Set of currently-buffering sides. Tracking BOTH (not one overwritable ref) is what prevents a
    // concurrent double-stall deadlock: if both buffer we pause both, and only relaunch once the set
    // is empty (nobody buffering) — a single overwritten ref would strand one side paused forever.
    const stalledSetRef = useRef<Set<'a' | 'b'>>(new Set())

    const clampSeek = (v: HTMLVideoElement, t: number) => {
        const dur = Number.isFinite(v.duration) ? v.duration : Infinity
        v.currentTime = Math.max(0, Math.min(t, dur))
    }

    const play = useCallback(() => {
        const a = refA.current
        const b = refB.current
        if (!a || !b) return
        // Start BOTH simultaneously; if EITHER is blocked (autoplay policy) fail closed —
        // pause both so we never leave one side playing alone (MASTER-DOSSIER §1.4).
        Promise.all([a.play(), b.play()])
            .then(() => setPlaying(true))
            .catch(() => {
                a.pause()
                b.pause()
                setPlaying(false)
                toast.error('Không phát đồng bộ được — thử lại.')
            })
    }, [refA, refB])

    const pause = useCallback(() => {
        refA.current?.pause()
        refB.current?.pause()
        setPlaying(false)
    }, [refA, refB])

    const toggle = useCallback(() => {
        if (playingRef.current) pause()
        else play()
    }, [play, pause])

    const seekBoth = useCallback(
        (sec: number) => {
            const a = refA.current
            const b = refB.current
            if (!a || !b) return
            clampSeek(a, sec)
            clampSeek(b, sec)
            // Arm the skip-next-tick guard ONLY if a seek is actually pending. A no-op seek (already
            // at the target) fires no 'seeked', which would strand seekingRef=true and freeze drift.
            if (a.seeking || b.seeking) seekingRef.current = true
        },
        [refA, refB],
    )

    const setRate = useCallback(
        (r: number) => {
            setRateState(r)
            if (refA.current) refA.current.playbackRate = r
            if (refB.current) refB.current.playbackRate = r
        },
        [refA, refB],
    )

    // ── stall / ended / seeked listeners (the ONLY player→state feedback) ──
    useEffect(() => {
        const a = refA.current
        const b = refB.current
        if (!a || !b) return

        const clearSeeking = () => {
            seekingRef.current = false
        }
        const syncStalledUi = () => {
            const s = stalledSetRef.current
            setStalledSide(s.has('a') ? 'a' : s.has('b') ? 'b' : null)
        }
        // A side started buffering (while the user intends to play) → HOLD the partner + record the
        // stall. Recording BOTH sides (a Set) is the deadlock fix: if both buffer, both get paused,
        // and we relaunch only once NEITHER is buffering.
        const onWaiting = (side: 'a' | 'b', other: HTMLVideoElement) => () => {
            if (!playingRef.current) return // buffering while intentionally paused → ignore
            stalledSetRef.current.add(side)
            syncStalledUi()
            other.pause()
        }
        // A side recovered. Clear it; once NOBODY is buffering and play is still intended, relaunch
        // BOTH (drift then re-syncs). 'canplay' fires even while the element is PAUSED (the
        // double-stall case where this side was paused by its partner); 'playing' covers a
        // self-recovering single stall. The has()-guard makes both idempotent + ignores initial load.
        const onRecover = (side: 'a' | 'b') => () => {
            if (!stalledSetRef.current.has(side)) return
            stalledSetRef.current.delete(side)
            syncStalledUi()
            if (stalledSetRef.current.size === 0 && playingRef.current) {
                a.play().catch(() => {})
                b.play().catch(() => {})
            }
        }
        const onEnded = () => {
            // The shorter clip ends first and natively holds its last frame; the other keeps
            // playing. When BOTH have ended, settle the transport to paused.
            if (a.ended && b.ended) setPlaying(false)
        }

        const onWaitingA = onWaiting('a', b)
        const onWaitingB = onWaiting('b', a)
        const onRecoverA = onRecover('a')
        const onRecoverB = onRecover('b')

        a.addEventListener('seeked', clearSeeking)
        b.addEventListener('seeked', clearSeeking)
        a.addEventListener('waiting', onWaitingA)
        b.addEventListener('waiting', onWaitingB)
        a.addEventListener('canplay', onRecoverA)
        b.addEventListener('canplay', onRecoverB)
        a.addEventListener('playing', onRecoverA)
        b.addEventListener('playing', onRecoverB)
        a.addEventListener('ended', onEnded)
        b.addEventListener('ended', onEnded)

        return () => {
            a.removeEventListener('seeked', clearSeeking)
            b.removeEventListener('seeked', clearSeeking)
            a.removeEventListener('waiting', onWaitingA)
            b.removeEventListener('waiting', onWaitingB)
            a.removeEventListener('canplay', onRecoverA)
            b.removeEventListener('canplay', onRecoverB)
            a.removeEventListener('playing', onRecoverA)
            b.removeEventListener('playing', onRecoverB)
            a.removeEventListener('ended', onEnded)
            b.removeEventListener('ended', onEnded)
            stalledSetRef.current.clear() // reset if the effect re-attaches (bothReady changed)
        }
    }, [refA, refB, bothReady])

    // [F6] A side just (re)attached — if a version was swapped mid-playback, resume BOTH so the
    // reloaded side doesn't sit frozen at 0 while the other keeps playing; the drift interval then
    // re-syncs it to the reference. Fires only on the false→true edge of bothReady and only when the
    // user intends to play (playingRef) — so the initial load doesn't auto-play.
    useEffect(() => {
        if (bothReady && playingRef.current) {
            refA.current?.play().catch(() => {})
            refB.current?.play().catch(() => {})
        }
    }, [bothReady, refA, refB])

    // ── drift correction: 500ms, ONLY while both actually play ──
    useEffect(() => {
        if (!playing) return
        const id = setInterval(() => {
            const a = refA.current
            const b = refB.current
            if (!a || !b) return
            // Skip while anything is mid-seek or one side is stalled/paused — correcting then
            // fights the very transition it's reacting to (swesonga's "keeps interrupting").
            if (a.seeking || b.seeking || seekingRef.current || stalledSetRef.current.size > 0) return
            if (a.paused || b.paused) return

            const delta = b.currentTime - a.currentTime // A (left) is the reference
            const abs = Math.abs(delta)
            const r = rateRef.current

            if (abs < EPS) {
                // In sync → make sure neither side is stuck at a catch-up rate.
                if (a.playbackRate !== r) a.playbackRate = r
                if (b.playbackRate !== r) b.playbackRate = r
                return
            }
            if (abs >= HARD) {
                // Too far apart to ease → hard-seek the follower to the reference. Arm the
                // skip-next-tick guard only if the seek actually started (else it fires no
                // 'seeked' and would strand the flag, freezing all further correction).
                a.playbackRate = r
                b.playbackRate = r
                clampSeek(b, a.currentTime)
                if (b.seeking) seekingRef.current = true
                return
            }
            // 0.05 ≤ |delta| < 0.5 → nudge the LAGGING side up by ×1.05 (inaudible — only the
            // active side has audio). delta>0 ⇒ B ahead ⇒ A lags; delta<0 ⇒ B lags.
            const laggard = delta > 0 ? a : b
            const leader = delta > 0 ? b : a
            laggard.playbackRate = r * CATCHUP
            leader.playbackRate = r
        }, TICK)
        return () => {
            clearInterval(id)
            // Leaving the playing state → drop any catch-up rate back to the intended rate.
            if (refA.current) refA.current.playbackRate = rateRef.current
            if (refB.current) refB.current.playbackRate = rateRef.current
        }
    }, [playing, refA, refB])

    return { playing, rate, stalledSide, play, pause, toggle, seekBoth, setRate }
}
