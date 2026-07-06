// [Review module P4.2] Native <video> + hls.js engine for the review player.
// Chosen over the Vidstack React wrapper because its `latest` tag pins React ^18
// while this app is React 19 / Next 16 (see IMPLEMENTATION-NOTES). A raw <video>
// also gives direct requestVideoFrameCallback control — the P4 frame-accuracy đinh
// requirement (FR-E02) — which the wrapper hides. hls.js is loaded dynamically so
// it never touches the server bundle. iPhone Safari uses native HLS (Auto quality).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPlaybackToken, hlsUrl } from '@/lib/review/player-api'
import { frameToSeekTime, timeToFrame, type Fps } from '@/lib/review/timecode'

export interface QualityLevel {
    index: number // hls.js level index; -1 = auto
    height: number | null
    label: string
}

export interface PlayerController {
    ready: boolean
    error: string | null
    isPlaying: boolean
    frame: number
    currentSec: number
    durationSec: number
    playbackRate: number
    muted: boolean
    volume: number
    levels: QualityLevel[]
    currentLevel: number // -1 = auto
    nativeHls: boolean // iPhone Safari path (no quality control)
    play: () => void
    pause: () => void
    toggle: () => void
    seekToFrame: (frame: number) => void
    seekToSeconds: (sec: number) => void
    step: (frames: number) => void
    setRate: (rate: number) => void
    setLevel: (index: number) => void
    toggleMute: () => void
    setVolume: (v: number) => void
}

/**
 * Attach hls.js to a <video> for one READY video version and expose a controller.
 * `enabled` gates the whole thing (false for images / not-ready versions).
 */
export function useHlsPlayer(opts: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    versionId: string | null
    fps: Fps | null
    enabled: boolean
}): PlayerController {
    const { videoRef, versionId, fps, enabled } = opts

    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [frame, setFrame] = useState(0)
    const [currentSec, setCurrentSec] = useState(0)
    const [durationSec, setDurationSec] = useState(0)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [muted, setMuted] = useState(false)
    const [volume, setVolumeState] = useState(1)
    const [levels, setLevels] = useState<QualityLevel[]>([])
    const [currentLevel, setCurrentLevel] = useState(-1)
    const [nativeHls, setNativeHls] = useState(false)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hlsRef = useRef<any>(null)
    const rvfcHandleRef = useRef<number | null>(null)
    const rafHandleRef = useRef<number | null>(null)
    const lastFrameRef = useRef(-1)
    const refreshAttemptsRef = useRef(0) // 403 token re-mints since the last successful load
    const fpsRef = useRef<Fps | null>(fps)
    fpsRef.current = fps

    const syncFrame = useCallback((time: number) => {
        const f = fpsRef.current
        if (!f) {
            setCurrentSec(time) // no fps (image / metadata missing) — raw seconds
            return
        }
        // Coalesce currentSec with the frame change so a single render carries both,
        // and we skip a setState entirely when the displayed frame hasn't advanced
        // (paused 'timeupdate' spam, duplicate ticks) — avoids needless shell renders.
        const fr = timeToFrame(time, f)
        if (fr !== lastFrameRef.current) {
            lastFrameRef.current = fr
            setFrame(fr)
            setCurrentSec(time)
        }
    }, [])

    // ── attach hls.js (or native HLS on Safari) for the current version ──
    useEffect(() => {
        if (!enabled || !versionId) return
        const video = videoRef.current
        if (!video) return
        let cancelled = false
        setReady(false)
        setError(null)
        lastFrameRef.current = -1
        refreshAttemptsRef.current = 0
        setFrame(0)

        const nativeCanPlay = video.canPlayType('application/vnd.apple.mpegurl') !== ''

        async function setup() {
            try {
                const token = await fetchPlaybackToken(versionId!)
                if (cancelled || !video) return
                const url = hlsUrl(token.playbackId, token.tokens.playback)

                if (nativeCanPlay) {
                    setNativeHls(true)
                    video.src = url
                    setReady(true)
                    return
                }

                const mod = await import('hls.js')
                const Hls = mod.default
                if (cancelled) return
                if (!Hls.isSupported()) {
                    // Last-resort: hand the URL to the element and hope for native support.
                    video.src = url
                    setNativeHls(true)
                    setReady(true)
                    return
                }
                // autoStartLoad:false so we can pin the START level to the TOP rendition
                // before any media loads. hls.js otherwise starts on the lowest rendition
                // and ABR climbs — a review tool must be sharp from 00:00 (the first
                // seconds are exactly what reviewers scrutinize). ABR stays enabled
                // afterwards; the quality menu can still pin a level or return to Auto.
                const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, autoStartLoad: false })
                hlsRef.current = hls
                hls.loadSource(url)
                hls.attachMedia(video)
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    const lv: QualityLevel[] = hls.levels.map((l: { height?: number }, i: number) => ({
                        index: i,
                        height: l.height ?? null,
                        label: l.height ? `${l.height}p` : `#${i + 1}`,
                    }))
                    setLevels(lv)
                    hls.startLevel = Math.max(0, hls.levels.length - 1) // begin at highest quality
                    hls.startLoad()
                    setReady(true)
                })
                // Reset the 403 re-mint budget only when MEDIA actually flows. Resetting on
                // MANIFEST_PARSED (as before) let a "master loads / renditions 403" shape
                // re-mint forever: refresh → manifest parses (reset) → rendition 403 → refresh…
                hls.on(Hls.Events.FRAG_BUFFERED, () => {
                    refreshAttemptsRef.current = 0
                })
                hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, data: { level: number }) => {
                    if (hls.autoLevelEnabled) setCurrentLevel(-1)
                    else setCurrentLevel(data.level)
                })
                hls.on(Hls.Events.ERROR, async (_e: unknown, data: { fatal?: boolean; type?: string; response?: { code?: number } }) => {
                    if (!data.fatal) return
                    // 403 → the signed token likely expired; re-mint and reload — but CAP the
                    // retries so a genuinely-forbidden version (revoked policy / rotated key)
                    // can't spin an unbounded re-mint↔403 loop hammering Mux + our token route.
                    if (data.response?.code === 403 && refreshAttemptsRef.current < 2) {
                        refreshAttemptsRef.current += 1
                        try {
                            const fresh = await fetchPlaybackToken(versionId!)
                            if (cancelled) return
                            hls.loadSource(hlsUrl(fresh.playbackId, fresh.tokens.playback))
                            return
                        } catch {
                            /* fall through to the error surface */
                        }
                    }
                    setError('Không tải được video. Vui lòng thử lại.')
                })
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'Không tải được video.')
            }
        }
        setup()

        return () => {
            cancelled = true
            if (hlsRef.current) {
                hlsRef.current.destroy()
                hlsRef.current = null
            }
            setNativeHls(false)
            setLevels([])
            if (video) {
                video.removeAttribute('src')
                try {
                    video.load()
                } catch {
                    /* ignore */
                }
            }
        }
    }, [enabled, versionId, videoRef])

    // ── frame tracking (rVFC when available; rAF/timeupdate fallback) ──
    useEffect(() => {
        if (!enabled) return
        const video = videoRef.current
        if (!video) return
        const hasVfc = typeof video.requestVideoFrameCallback === 'function'

        const onVfc = (_now: number, metadata: VideoFrameCallbackMetadata) => {
            syncFrame(metadata.mediaTime)
            if (!video.paused && typeof video.requestVideoFrameCallback === 'function') {
                rvfcHandleRef.current = video.requestVideoFrameCallback(onVfc)
            }
        }
        const rafTick = () => {
            syncFrame(video.currentTime)
            if (!video.paused) rafHandleRef.current = requestAnimationFrame(rafTick)
        }
        const startTracking = () => {
            if (hasVfc && video.requestVideoFrameCallback) {
                rvfcHandleRef.current = video.requestVideoFrameCallback(onVfc)
            } else {
                rafHandleRef.current = requestAnimationFrame(rafTick)
            }
        }
        const stopTracking = () => {
            if (rvfcHandleRef.current != null && video.cancelVideoFrameCallback) {
                video.cancelVideoFrameCallback(rvfcHandleRef.current)
                rvfcHandleRef.current = null
            }
            if (rafHandleRef.current != null) {
                cancelAnimationFrame(rafHandleRef.current)
                rafHandleRef.current = null
            }
        }

        const onPlay = () => {
            setIsPlaying(true)
            startTracking()
        }
        const onPause = () => {
            setIsPlaying(false)
            stopTracking()
            syncFrame(video.currentTime)
        }
        const onSeeked = () => syncFrame(video.currentTime)
        const onTimeUpdate = () => {
            if (video.paused) syncFrame(video.currentTime)
        }
        const onLoaded = () => setDurationSec(Number.isFinite(video.duration) ? video.duration : 0)
        const onRate = () => setPlaybackRate(video.playbackRate)
        const onVol = () => {
            setMuted(video.muted)
            setVolumeState(video.volume)
        }

        video.addEventListener('play', onPlay)
        video.addEventListener('pause', onPause)
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('timeupdate', onTimeUpdate)
        video.addEventListener('loadedmetadata', onLoaded)
        video.addEventListener('durationchange', onLoaded)
        video.addEventListener('ratechange', onRate)
        video.addEventListener('volumechange', onVol)

        return () => {
            stopTracking()
            video.removeEventListener('play', onPlay)
            video.removeEventListener('pause', onPause)
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('timeupdate', onTimeUpdate)
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('durationchange', onLoaded)
            video.removeEventListener('ratechange', onRate)
            video.removeEventListener('volumechange', onVol)
        }
    }, [enabled, versionId, videoRef, syncFrame])

    // ── controls ──
    const play = useCallback(() => {
        videoRef.current?.play().catch(() => {})
    }, [videoRef])
    const pause = useCallback(() => videoRef.current?.pause(), [videoRef])
    const toggle = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play().catch(() => {})
        else v.pause()
    }, [videoRef])
    const seekToSeconds = useCallback(
        (sec: number) => {
            const v = videoRef.current
            if (!v) return
            v.currentTime = Math.max(0, sec)
        },
        [videoRef],
    )
    const seekToFrame = useCallback(
        (fr: number) => {
            const f = fpsRef.current
            const v = videoRef.current
            if (!v) return
            v.currentTime = f ? frameToSeekTime(fr, f) : fr
        },
        [videoRef],
    )
    const step = useCallback(
        (frames: number) => {
            const v = videoRef.current
            if (!v) return
            v.pause()
            const f = fpsRef.current
            if (f) {
                const cur = timeToFrame(v.currentTime, f)
                v.currentTime = frameToSeekTime(cur + frames, f)
            } else {
                v.currentTime = Math.max(0, v.currentTime + frames / 30)
            }
        },
        [videoRef],
    )
    const setRate = useCallback(
        (rate: number) => {
            const v = videoRef.current
            if (v) v.playbackRate = rate
        },
        [videoRef],
    )
    const setLevel = useCallback((index: number) => {
        const hls = hlsRef.current
        if (!hls) return
        hls.currentLevel = index // -1 = auto
        setCurrentLevel(index)
    }, [])
    const toggleMute = useCallback(() => {
        const v = videoRef.current
        if (v) v.muted = !v.muted
    }, [videoRef])
    const setVolume = useCallback(
        (val: number) => {
            const v = videoRef.current
            if (v) {
                v.volume = Math.min(1, Math.max(0, val))
                if (val > 0 && v.muted) v.muted = false
            }
        },
        [videoRef],
    )

    return {
        ready,
        error,
        isPlaying,
        frame,
        currentSec,
        durationSec,
        playbackRate,
        muted,
        volume,
        levels,
        currentLevel,
        nativeHls,
        play,
        pause,
        toggle,
        seekToFrame,
        seekToSeconds,
        step,
        setRate,
        setLevel,
        toggleMute,
        setVolume,
    }
}
