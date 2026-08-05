'use client'

// [Giải trí] Máy phát của kho phim — <video> thuần + hls.js.
//
// Fork rút gọn của review/player/useHlsPlayer: bỏ toàn bộ phần bám khung hình
// (rVFC/fps — thứ dân dựng phim cần, người xem phim thì không), bỏ PlayerEnv, bỏ
// cờ đóng dịch vụ của Tệp. GIỮ NGUYÊN mấy quyết định đã trả giá mới có ở BR-06:
//   • autoStartLoad:false rồi tự ghim startLevel = rendition CAO NHẤT trước khi
//     tải fragment nào ⇒ nét ngay từ giây 0, không "mờ 4-5 giây đầu"
//   • testBandwidth:false ⇒ không hạ chất lượng để đo băng thông
//   • chọn top level bằng reduce theo height (tie-break bitrate), KHÔNG dùng
//     levels.length-1 (có manifest xếp ngược, cách đó chọn nhầm mức thấp nhất)
//   • ERROR 403 ⇒ xin token mới, TỐI ĐA 2 lần, và chỉ reset hạn mức khi
//     FRAG_BUFFERED (reset ở MANIFEST_PARSED sinh vòng lặp vô hạn)

import { useCallback, useEffect, useRef, useState } from 'react'

export interface EntQualityLevel {
    index: number // -1 = tự động
    height: number | null
    label: string
}

export interface EntPlayerController {
    ready: boolean
    error: string | null
    isPlaying: boolean
    currentSec: number
    durationSec: number
    bufferedSec: number
    playbackRate: number
    muted: boolean
    volume: number
    levels: EntQualityLevel[]
    currentLevel: number
    nativeHls: boolean
    play: () => void
    pause: () => void
    toggle: () => void
    seekTo: (sec: number) => void
    /** Tua tương đối, dùng cho nút ±10 giây và phím mũi tên. */
    nudge: (deltaSec: number) => void
    setRate: (rate: number) => void
    setLevel: (index: number) => void
    toggleMute: () => void
    setVolume: (v: number) => void
}

interface TokenResponse {
    playbackId: string
    token: string
}

const LOAD_ERROR = 'Không tải được video. Vui lòng thử lại.'

async function fetchToken(videoId: string): Promise<TokenResponse> {
    const res = await fetch(`/api/ent/videos/${videoId}/playback-token`, { method: 'POST' })
    if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message ?? LOAD_ERROR)
    }
    return res.json()
}

const hlsUrl = (playbackId: string, token: string) => `https://stream.mux.com/${playbackId}.m3u8?token=${token}`

export function useEntPlayer(opts: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    videoId: string | null
    enabled: boolean
}): EntPlayerController {
    const { videoRef, videoId, enabled } = opts

    const [ready, setReady] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentSec, setCurrentSec] = useState(0)
    const [durationSec, setDurationSec] = useState(0)
    const [bufferedSec, setBufferedSec] = useState(0)
    const [playbackRate, setPlaybackRate] = useState(1)
    const [muted, setMuted] = useState(false)
    const [volume, setVolumeState] = useState(1)
    const [levels, setLevels] = useState<EntQualityLevel[]>([])
    const [currentLevel, setCurrentLevel] = useState(-1)
    const [nativeHls, setNativeHls] = useState(false)

    const hlsRef = useRef<any>(null)
    const refreshAttemptsRef = useRef(0)

    // ── gắn hls.js (hoặc HLS gốc trên Safari) ──
    useEffect(() => {
        if (!enabled || !videoId) return
        const video = videoRef.current
        if (!video) return

        let cancelled = false
        setReady(false)
        setError(null)
        setNativeHls(false)
        setCurrentLevel(-1)
        refreshAttemptsRef.current = 0

        const nativeCanPlay = video.canPlayType('application/vnd.apple.mpegurl') !== ''

        async function setup() {
            try {
                const token = await fetchToken(videoId!)
                if (cancelled || !video) return
                const url = hlsUrl(token.playbackId, token.token)

                const mod = await import('hls.js')
                const Hls = mod.default
                if (cancelled) return

                if (!Hls.isSupported()) {
                    // iPhone/iPad Safari tự lo HLS. Mất nút chọn chất lượng, bù lại
                    // token đã ký kèm rendition_order='desc' nên bắt đầu từ mức cao.
                    if (nativeCanPlay) {
                        setNativeHls(true)
                        video.src = url
                        setReady(true)
                        return
                    }
                    throw new Error(LOAD_ERROR)
                }

                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: false,
                    // Phim dài, người xem hay tua — đệm rộng hơn player review (30s).
                    maxBufferLength: 60,
                    autoStartLoad: false,
                    testBandwidth: false,
                    abrEwmaDefaultEstimate: 8_000_000,
                    abrEwmaDefaultEstimateMax: 20_000_000,
                    startFragPrefetch: true,
                    capLevelToPlayerSize: false,
                })
                hlsRef.current = hls
                hls.loadSource(url)
                hls.attachMedia(video)

                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    setLevels(
                        hls.levels.map((l: { height?: number }, i: number) => ({
                            index: i,
                            height: l.height ?? null,
                            label: l.height ? `${l.height}p` : `#${i + 1}`,
                        })),
                    )
                    const topLevel = hls.levels.reduce(
                        (
                            bestIndex: number,
                            level: { height?: number; bitrate?: number },
                            index: number,
                            all: Array<{ height?: number; bitrate?: number }>,
                        ) => {
                            const best = all[bestIndex]
                            const bestHeight = best?.height ?? 0
                            const levelHeight = level.height ?? 0
                            if (levelHeight !== bestHeight) return levelHeight > bestHeight ? index : bestIndex
                            return (level.bitrate ?? 0) > (best?.bitrate ?? 0) ? index : bestIndex
                        },
                        0,
                    )
                    hls.startLevel = topLevel
                    hls.startLoad()
                    setReady(true)
                })
                hls.on(Hls.Events.FRAG_BUFFERED, () => {
                    refreshAttemptsRef.current = 0
                })
                hls.on(Hls.Events.LEVEL_SWITCHED, (_e: unknown, data: { level: number }) => {
                    setCurrentLevel(hls.autoLevelEnabled ? -1 : data.level)
                })
                hls.on(
                    Hls.Events.ERROR,
                    async (_e: unknown, data: { fatal?: boolean; response?: { code?: number } }) => {
                        if (!data.fatal) return
                        if (data.response?.code === 403 && refreshAttemptsRef.current < 2) {
                            refreshAttemptsRef.current += 1
                            try {
                                const fresh = await fetchToken(videoId!)
                                if (cancelled) return
                                hls.loadSource(hlsUrl(fresh.playbackId, fresh.token))
                                return
                            } catch {
                                /* rơi xuống hiển thị lỗi */
                            }
                        }
                        setError(LOAD_ERROR)
                    },
                )
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : LOAD_ERROR)
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
                    /* bỏ qua */
                }
            }
        }
    }, [enabled, videoId, videoRef])

    // ── bám trạng thái phát ──
    useEffect(() => {
        if (!enabled) return
        const video = videoRef.current
        if (!video) return

        const onTime = () => {
            setCurrentSec(video.currentTime)
            // Mốc đã tải sẵn: vẽ vệt sáng mờ trên thanh tua như các trang xem phim.
            const b = video.buffered
            for (let i = 0; i < b.length; i++) {
                if (b.start(i) <= video.currentTime && video.currentTime <= b.end(i)) {
                    setBufferedSec(b.end(i))
                    break
                }
            }
        }
        const onPlay = () => setIsPlaying(true)
        const onPause = () => setIsPlaying(false)
        const onLoaded = () => setDurationSec(Number.isFinite(video.duration) ? video.duration : 0)
        const onRate = () => setPlaybackRate(video.playbackRate)
        const onVol = () => {
            setMuted(video.muted)
            setVolumeState(video.volume)
        }

        video.addEventListener('timeupdate', onTime)
        video.addEventListener('seeked', onTime)
        video.addEventListener('progress', onTime)
        video.addEventListener('play', onPlay)
        video.addEventListener('pause', onPause)
        video.addEventListener('loadedmetadata', onLoaded)
        video.addEventListener('durationchange', onLoaded)
        video.addEventListener('ratechange', onRate)
        video.addEventListener('volumechange', onVol)
        return () => {
            video.removeEventListener('timeupdate', onTime)
            video.removeEventListener('seeked', onTime)
            video.removeEventListener('progress', onTime)
            video.removeEventListener('play', onPlay)
            video.removeEventListener('pause', onPause)
            video.removeEventListener('loadedmetadata', onLoaded)
            video.removeEventListener('durationchange', onLoaded)
            video.removeEventListener('ratechange', onRate)
            video.removeEventListener('volumechange', onVol)
        }
    }, [enabled, videoId, videoRef])

    // ── điều khiển ──
    const play = useCallback(() => videoRef.current?.play().catch(() => {}), [videoRef])
    const pause = useCallback(() => videoRef.current?.pause(), [videoRef])
    const toggle = useCallback(() => {
        const v = videoRef.current
        if (!v) return
        if (v.paused) v.play().catch(() => {})
        else v.pause()
    }, [videoRef])
    const seekTo = useCallback(
        (sec: number) => {
            const v = videoRef.current
            if (!v) return
            const max = Number.isFinite(v.duration) ? v.duration : sec
            v.currentTime = Math.min(Math.max(0, sec), max)
        },
        [videoRef],
    )
    const nudge = useCallback(
        (delta: number) => {
            const v = videoRef.current
            if (!v) return
            const max = Number.isFinite(v.duration) ? v.duration : v.currentTime + delta
            v.currentTime = Math.min(Math.max(0, v.currentTime + delta), max)
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
        hls.currentLevel = index // -1 = tự động
        setCurrentLevel(index)
    }, [])
    const toggleMute = useCallback(() => {
        const v = videoRef.current
        if (v) v.muted = !v.muted
    }, [videoRef])
    const setVolume = useCallback(
        (val: number) => {
            const v = videoRef.current
            if (!v) return
            v.volume = Math.min(1, Math.max(0, val))
            if (val > 0 && v.muted) v.muted = false
            if (val === 0) v.muted = true
        },
        [videoRef],
    )

    return {
        ready,
        error,
        isPlaying,
        currentSec,
        durationSec,
        bufferedSec,
        playbackRate,
        muted,
        volume,
        levels,
        currentLevel,
        nativeHls,
        play,
        pause,
        toggle,
        seekTo,
        nudge,
        setRate,
        setLevel,
        toggleMute,
        setVolume,
    }
}
