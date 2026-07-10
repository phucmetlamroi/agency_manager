// [Review module P4.2] Native <video> + hls.js engine for the review player.
// Chosen over the Vidstack React wrapper because its `latest` tag pins React ^18
// while this app is React 19 / Next 16 (see IMPLEMENTATION-NOTES). A raw <video>
// also gives direct requestVideoFrameCallback control — the P4 frame-accuracy đinh
// requirement (FR-E02) — which the wrapper hides. hls.js is loaded dynamically so
// it never touches the server bundle. iPhone Safari uses native HLS (Auto quality).

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { hlsUrl } from '@/lib/review/player-api'
import { frameToSeekTime, timeToFrame, type Fps } from '@/lib/review/timecode'
import { usePlayerEnv } from './player-env'

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
    nativeHls: boolean // Native-only fallback (typically iPhone/iPad Safari; no quality control)
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
    // [BR-06/P5] `compact` = this player shares the viewport with another (Compare, F6).
    // Compact players cap quality to their (smaller) box and DON'T pin the start level to
    // the top rendition — that pinning is the single-player sharp-from-00:00 behaviour and
    // would waste bandwidth × the number of streams. Single player (default) = false.
    compact?: boolean
}): PlayerController {
    const { videoRef, versionId, fps, enabled, compact = false } = opts
    // P5.3: token minting + error copy come from the environment (internal VN
    // /api/review/* vs guest EN /api/r/{slug}/*). Ref'd so the big attach effect
    // does not re-run when the env object identity changes.
    const env = usePlayerEnv()
    const fetchTokenRef = useRef(env.api.fetchPlaybackToken)
    fetchTokenRef.current = env.api.fetchPlaybackToken
    const loadErrorText =
        env.lang === 'en' ? 'The video failed to load. Please try again.' : 'Không tải được video. Vui lòng thử lại.'

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
        setNativeHls(false)
        setCurrentLevel(-1)
        lastFrameRef.current = -1
        refreshAttemptsRef.current = 0
        setFrame(0)

        const nativeCanPlay = video.canPlayType('application/vnd.apple.mpegurl') !== ''

        async function setup() {
            try {
                const token = await fetchTokenRef.current(versionId!)
                if (cancelled || !video) return
                const url = hlsUrl(token.playbackId, token.tokens.playback)

                const mod = await import('hls.js')
                const Hls = mod.default
                if (cancelled) return
                if (!Hls.isSupported()) {
                    // iPhone/iPad Safari owns HLS natively. On every browser that supports
                    // hls.js we deliberately use it instead: native implementations hide the
                    // rendition picker and may begin at a low ABR rendition with no API for us
                    // to correct it. The signed Mux token still orders native renditions high→low.
                    if (nativeCanPlay) {
                        setNativeHls(true)
                        video.src = url
                        setReady(true)
                        return
                    }
                    throw new Error(loadErrorText)
                }
                // [BR-06] Kill the "blurry first 4–5s". Root cause: hls.js defaults to the
                // LOWEST rendition and runs a bandwidth probe before ABR climbs — a review
                // tool must be sharp from 00:00 (the first seconds are exactly what reviewers
                // scrutinize). Countermeasures, in order:
                //   • autoStartLoad:false + select startLevel from the parsed rendition metadata
                //     (below) before ANY media fragment loads — sharp from frame 0.
                //   • testBandwidth:false — don't drop to a low level to probe the pipe; honour
                //     the pinned startLevel instead.
                //   • abrEwmaDefaultEstimate high — assume a fast connection until real
                //     throughput data arrives, so ABR never *falls back* to a soft level early.
                //   • startFragPrefetch — fetch the first fragment ASAP.
                // ABR stays enabled afterwards; the quality menu can still pin a level or Auto.
                // `capLevelToPlayerSize`: single player = false (allow top quality even when the
                // element is small / before fullscreen); compact/Compare = true (cap to the box
                // to keep 2 streams affordable). See {compact} in the hook opts.
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    maxBufferLength: compact ? 12 : 30,
                    autoStartLoad: false,
                    testBandwidth: false,
                    abrEwmaDefaultEstimate: 8_000_000,
                    abrEwmaDefaultEstimateMax: 20_000_000,
                    startFragPrefetch: true,
                    capLevelToPlayerSize: compact,
                })
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
                    // Single player begins at the actual highest rendition (BR-06). Mux can order
                    // variants high→low for native playback, but hls.js does not promise that its
                    // internal array preserves that ordering. Choosing `length - 1` therefore picked
                    // the *lowest* level for some manifests and made every review start soft.
                    // `startLevel` sets only the first fragment; ABR remains automatic afterwards.
                    // A compact Compare player lets ABR choose within its player-size cap so two
                    // streams do not pull their top bitrates at once.
                    if (!compact) {
                        const topLevel = hls.levels.reduce((bestIndex: number, level: { height?: number; bitrate?: number }, index: number, all: Array<{ height?: number; bitrate?: number }>) => {
                            const best = all[bestIndex]
                            const bestHeight = best?.height ?? 0
                            const levelHeight = level.height ?? 0
                            if (levelHeight !== bestHeight) return levelHeight > bestHeight ? index : bestIndex
                            return (level.bitrate ?? 0) > (best?.bitrate ?? 0) ? index : bestIndex
                        }, 0)
                        hls.startLevel = topLevel
                    }
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
                            const fresh = await fetchTokenRef.current(versionId!)
                            if (cancelled) return
                            hls.loadSource(hlsUrl(fresh.playbackId, fresh.tokens.playback))
                            return
                        } catch {
                            /* fall through to the error surface */
                        }
                    }
                    setError(loadErrorText)
                })
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : loadErrorText)
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
            setCurrentLevel(-1)
            if (video) {
                video.removeAttribute('src')
                try {
                    video.load()
                } catch {
                    /* ignore */
                }
            }
        }
    }, [compact, enabled, loadErrorText, versionId, videoRef])

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
