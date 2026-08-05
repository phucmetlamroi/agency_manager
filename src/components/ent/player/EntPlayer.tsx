'use client'

// [Giải trí] Trình xem phim toàn màn hình.
//
// Các quy ước lấy từ những trang xem phim phổ biến:
//   • điều khiển TỰ ẨN sau 3 giây không cử động chuột, hiện lại khi rê/chạm
//   • bấm vào mặt video = phát/dừng, kèm biểu tượng loé giữa màn
//   • bấm đúp = toàn màn hình (desktop)
//   • phím tắt: Space/K phát-dừng · ←/→ ±10 giây · ↑/↓ âm lượng · F · M · C
//   • NHỚ VỊ TRÍ đang xem dở (localStorage), mở lại là chạy tiếp
//
// Toàn màn hình: dùng Fullscreen API, nhưng iOS Safari không cho fullscreen phần
// tử div — nên có đường lùi "giả toàn màn hình" bằng CSS fixed inset-0.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Play, Pause, Loader2, AlertTriangle } from 'lucide-react'
import { useEntPlayer } from './useEntPlayer'
import EntPlayerControls, { type SubtitleOption } from './EntPlayerControls'

const CONTROLS_HIDE_MS = 3000
const RESUME_KEY = (id: string) => `ent:pos:${id}`
/** Dưới 30 giây thì coi như mới bấm vào; trên 95% thì coi như đã xem hết. */
const RESUME_MIN_SEC = 30
const RESUME_MAX_RATIO = 0.95

export default function EntPlayer({
    videoId,
    title,
    posterUrl,
    subtitles,
}: {
    videoId: string
    title: string
    posterUrl: string | null
    subtitles: SubtitleOption[]
}) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const shellRef = useRef<HTMLDivElement>(null)
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const c = useEntPlayer({ videoRef, videoId, enabled: true })

    const [controlsVisible, setControlsVisible] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [pseudoFs, setPseudoFs] = useState(false)
    const [flash, setFlash] = useState<'play' | 'pause' | null>(null)
    const [activeSub, setActiveSub] = useState<string | null>(null)
    const resumedRef = useRef(false)

    // ── tự ẩn điều khiển ──
    const poke = useCallback(() => {
        setControlsVisible(true)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
    }, [])

    useEffect(() => {
        poke()
        return () => {
            if (hideTimer.current) clearTimeout(hideTimer.current)
        }
    }, [poke])

    // Đang dừng thì LUÔN hiện điều khiển — ẩn lúc dừng chỉ làm người xem hoang mang.
    const showControls = controlsVisible || !c.isPlaying

    // ── nhớ vị trí xem dở ──
    useEffect(() => {
        if (!c.ready || resumedRef.current || !c.durationSec) return
        resumedRef.current = true
        try {
            const saved = Number(localStorage.getItem(RESUME_KEY(videoId)) ?? '')
            if (Number.isFinite(saved) && saved > RESUME_MIN_SEC && saved < c.durationSec * RESUME_MAX_RATIO) {
                c.seekTo(saved)
            }
        } catch {
            /* localStorage bị chặn — bỏ qua, không phải lỗi đáng báo */
        }
    }, [c, c.ready, c.durationSec, videoId])

    useEffect(() => {
        if (!c.isPlaying) return
        const t = setInterval(() => {
            try {
                const v = videoRef.current
                if (!v || !Number.isFinite(v.duration)) return
                if (v.currentTime > v.duration * RESUME_MAX_RATIO) localStorage.removeItem(RESUME_KEY(videoId))
                else localStorage.setItem(RESUME_KEY(videoId), String(Math.floor(v.currentTime)))
            } catch {
                /* bỏ qua */
            }
        }, 5000)
        return () => clearInterval(t)
    }, [c.isPlaying, videoId])

    // ── toàn màn hình ──
    const toggleFullscreen = useCallback(() => {
        const el = shellRef.current
        if (!el) return
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {})
            return
        }
        if (pseudoFs) {
            setPseudoFs(false)
            return
        }
        if (typeof el.requestFullscreen === 'function') {
            el.requestFullscreen().catch(() => setPseudoFs(true))
        } else {
            // iOS Safari: không fullscreen được thẻ div ⇒ giả lập bằng CSS.
            setPseudoFs(true)
        }
    }, [pseudoFs])

    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement)
        document.addEventListener('fullscreenchange', onFs)
        return () => document.removeEventListener('fullscreenchange', onFs)
    }, [])

    // ── phím tắt ──
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            // Đang gõ trong ô nhập thì phím tắt phải im — nếu không, gõ chữ "f" trong
            // ô tìm kiếm sẽ bật toàn màn hình.
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            poke()
            switch (e.key) {
                case ' ':
                case 'k':
                case 'K':
                    e.preventDefault()
                    c.toggle()
                    break
                case 'ArrowLeft':
                    e.preventDefault()
                    c.nudge(-10)
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    c.nudge(10)
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    c.setVolume(Math.min(1, c.volume + 0.1))
                    break
                case 'ArrowDown':
                    e.preventDefault()
                    c.setVolume(Math.max(0, c.volume - 0.1))
                    break
                case 'f':
                case 'F':
                    toggleFullscreen()
                    break
                case 'm':
                case 'M':
                    c.toggleMute()
                    break
                case 'c':
                case 'C':
                    if (subtitles.length) setActiveSub((cur) => (cur ? null : subtitles[0].id))
                    break
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [c, poke, subtitles, toggleFullscreen])

    // ── bật/tắt track phụ đề trên thẻ video ──
    useEffect(() => {
        const v = videoRef.current
        if (!v) return
        // Duyệt textTracks của chính DOM (không phải danh sách React) vì trình duyệt
        // mới là nơi giữ trạng thái showing/hidden thật.
        for (let i = 0; i < v.textTracks.length; i++) {
            const track = v.textTracks[i]
            const wanted = subtitles[i]?.id === activeSub
            track.mode = wanted ? 'showing' : 'hidden'
        }
    }, [activeSub, subtitles, c.ready])

    const onSurfaceClick = () => {
        setFlash(c.isPlaying ? 'pause' : 'play')
        setTimeout(() => setFlash(null), 450)
        c.toggle()
        poke()
    }

    return (
        <div
            ref={shellRef}
            onMouseMove={poke}
            onTouchStart={poke}
            className={`relative flex flex-col bg-black ${
                pseudoFs ? 'fixed inset-0 z-50 h-[100dvh] w-screen' : 'h-[100dvh] w-full'
            } ${showControls ? '' : 'cursor-none'}`}
        >
            {/* Bề mặt video */}
            <div className="relative flex-1 overflow-hidden" onClick={onSurfaceClick} onDoubleClick={toggleFullscreen}>
                {/* KHÔNG đặt crossOrigin: phụ đề là same-origin (/api/ent/...) nên không
                    cần, mà đặt vào sẽ bắt cả nguồn HLS gốc trên Safari phải qua CORS. */}
                <video
                    ref={videoRef}
                    poster={posterUrl ?? undefined}
                    playsInline
                    className="h-full w-full object-contain"
                >
                    {subtitles.map((s) => (
                        <track
                            key={s.id}
                            kind="subtitles"
                            label={s.label}
                            srcLang={s.lang ?? undefined}
                            src={`/api/ent/videos/${videoId}/subtitles/${s.id}`}
                        />
                    ))}
                </video>

                {/* Biểu tượng loé khi bấm */}
                <AnimatePresence>
                    {flash && (
                        <motion.div
                            initial={{ opacity: 0.9, scale: 0.8 }}
                            animate={{ opacity: 0, scale: 1.4 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45 }}
                            className="pointer-events-none absolute inset-0 flex items-center justify-center"
                        >
                            <span className="rounded-full bg-black/60 p-6 text-white">
                                {flash === 'play' ? (
                                    <Play className="h-9 w-9 fill-current" />
                                ) : (
                                    <Pause className="h-9 w-9 fill-current" />
                                )}
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {!c.ready && !c.error && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                    </div>
                )}
                {c.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                        <p className="text-zinc-300">{c.error}</p>
                    </div>
                )}
            </div>

            {/* Thanh trên: nút quay lại + tên phim — ẩn/hiện cùng điều khiển */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.18 }}
                        className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-4"
                    >
                        <Link
                            href="/entertainment"
                            onClick={(e) => e.stopPropagation()}
                            className="pointer-events-auto rounded-lg p-2 text-white transition-colors hover:bg-white/10"
                            title="Về kho phim"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <h1 className="truncate text-sm font-medium text-white md:text-base">{title}</h1>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Thanh điều khiển */}
            <AnimatePresence>
                {showControls && (
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 12 }}
                        transition={{ duration: 0.18 }}
                        className="absolute inset-x-0 bottom-0"
                    >
                        <EntPlayerControls
                            c={c}
                            isFullscreen={isFullscreen || pseudoFs}
                            onToggleFullscreen={toggleFullscreen}
                            subtitles={subtitles}
                            activeSubtitleId={activeSub}
                            onSelectSubtitle={setActiveSub}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
