'use client'

// [Giải trí] Trình xem phim toàn màn hình.
//
// Các quy ước lấy từ những trang xem phim phổ biến:
//   • điều khiển TỰ ẨN sau 3 giây không cử động chuột, hiện lại khi rê/chạm
//   • bấm vào mặt video = phát/dừng, kèm biểu tượng loé giữa màn
//   • bấm đúp = toàn màn hình (desktop)
//   • phím tắt: Space/K phát-dừng · ←/→ ±10 giây · ↑/↓ âm lượng · F · M · C
//   • NHỚ VỊ TRÍ đang xem dở, mở lại là chạy tiếp
//
// ─── SỬA SAU RÀ SOÁT 05/08/2026 ─────────────────────────────────────────────
// 1. Bấm đúp KHÔNG còn chạy phát/dừng hai lần: click chờ 220ms, có bấm đúp thì
//    huỷ lệnh chờ đó.
// 2. Trên máy cảm ứng, chạm khi điều khiển đang ẨN chỉ để HIỆN điều khiển —
//    trước đây chạm để xem nút thì phim dừng luôn.
// 3. Thanh điều khiển KHÔNG bị tháo khỏi DOM khi tự ẩn (chỉ mờ + tắt bắt sự kiện).
//    Tháo ra khiến menu đang mở biến mất giữa chừng.
// 4. Đang mở menu / đang kéo tua thì KHOÁ tự ẩn (onHoldChange).
// 5. Phím tắt bỏ qua khi có Ctrl/Cmd/Alt, và chỉ chặn ở ô nhập CHỮ (trước đây
//    chạm vào thanh âm lượng là mọi phím tắt chết vì nó cũng là <input>).
// 6. Ghi vị trí xem dở cả khi DỪNG, khi TUA và khi rời trang — trước chỉ ghi lúc
//    đang phát nên dừng rồi đóng tab là mất.
// 7. Gắn phụ đề theo ĐỐI TƯỢNG track (không theo chỉ số) và báo khi tệp phụ đề
//    hỏng, thay vì im lặng không hiện gì.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Play, Pause, Loader2, AlertTriangle } from 'lucide-react'
import { useEntPlayer } from './useEntPlayer'
import { useSubtitleSync } from './useSubtitleSync'
import EntPlayerControls, { type SubtitleOption } from './EntPlayerControls'
import EntSubtitleLayer from './EntSubtitleLayer'
import {
    readStoredSubSize,
    subSizePct,
    SUB_SIZE_DEFAULT,
    SUB_SIZE_STORAGE_KEY,
    type SubSizeKey,
} from './subtitle-style'

const CONTROLS_HIDE_MS = 3000
const DOUBLE_CLICK_WINDOW_MS = 220
const RESUME_KEY = (id: string) => `ent:pos:${id}`
/** Dưới 30 giây thì coi như mới bấm vào; trên 95% thì coi như đã xem hết. */
const RESUME_MIN_SEC = 30
const RESUME_MAX_RATIO = 0.95

/** Ô nhập CHỮ — chỉ những thứ này mới được cướp phím tắt. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'tel', 'url'])

function isTextEntry(el: EventTarget | null): boolean {
    if (!(el instanceof HTMLElement)) return false
    if (el.isContentEditable) return true
    if (el.tagName === 'TEXTAREA') return true
    if (el.tagName === 'INPUT') return TEXT_INPUT_TYPES.has((el as HTMLInputElement).type)
    return false
}

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
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const c = useEntPlayer({ videoRef, videoId, enabled: true })

    const [controlsVisible, setControlsVisible] = useState(true)
    const [holdOpen, setHoldOpen] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [pseudoFs, setPseudoFs] = useState(false)
    const [flash, setFlash] = useState<'play' | 'pause' | null>(null)
    const [activeSub, setActiveSub] = useState<string | null>(null)
    const [subError, setSubError] = useState<string | null>(null)
    // Đọc localStorage ở effect chứ không ở khởi tạo state: máy chủ dựng HTML
    // trước, đọc ngay lúc khởi tạo là lệch giữa hai bên (hydration mismatch).
    const [subSize, setSubSize] = useState<SubSizeKey>(SUB_SIZE_DEFAULT)
    const resumedRef = useRef(false)

    useEffect(() => setSubSize(readStoredSubSize()), [])

    const changeSubSize = useCallback((key: SubSizeKey) => {
        setSubSize(key)
        try {
            localStorage.setItem(SUB_SIZE_STORAGE_KEY, key)
        } catch {
            /* localStorage bị chặn */
        }
    }, [])

    const sync = useSubtitleSync({ videoRef, videoId, activeSubtitleId: activeSub })

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
            if (clickTimer.current) clearTimeout(clickTimer.current)
        }
    }, [poke])

    // Đang dừng, đang mở menu, hoặc đang kéo tua ⇒ LUÔN hiện điều khiển.
    const showControls = controlsVisible || !c.isPlaying || holdOpen

    // ── nhớ vị trí xem dở ──
    const saveProgress = useCallback(() => {
        try {
            const v = videoRef.current
            if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return
            if (v.currentTime > v.duration * RESUME_MAX_RATIO || v.currentTime < RESUME_MIN_SEC) {
                localStorage.removeItem(RESUME_KEY(videoId))
            } else {
                localStorage.setItem(RESUME_KEY(videoId), String(Math.floor(v.currentTime)))
            }
        } catch {
            /* localStorage bị chặn */
        }
    }, [videoId])

    useEffect(() => {
        if (!c.ready || resumedRef.current || !c.durationSec) return
        resumedRef.current = true
        try {
            const saved = Number(localStorage.getItem(RESUME_KEY(videoId)) ?? '')
            if (Number.isFinite(saved) && saved > RESUME_MIN_SEC && saved < c.durationSec * RESUME_MAX_RATIO) {
                c.seekTo(saved)
            }
        } catch {
            /* bỏ qua */
        }
    }, [c, c.ready, c.durationSec, videoId])

    useEffect(() => {
        const v = videoRef.current
        if (!v) return
        // Ghi ở MỌI thời điểm đáng ghi, không chỉ khi đang phát: dừng rồi đóng tab
        // là kịch bản thường gặp nhất và trước đây mất sạch.
        const tick = setInterval(saveProgress, 5000)
        v.addEventListener('pause', saveProgress)
        v.addEventListener('seeked', saveProgress)
        window.addEventListener('pagehide', saveProgress)
        document.addEventListener('visibilitychange', saveProgress)
        return () => {
            clearInterval(tick)
            saveProgress()
            v.removeEventListener('pause', saveProgress)
            v.removeEventListener('seeked', saveProgress)
            window.removeEventListener('pagehide', saveProgress)
            document.removeEventListener('visibilitychange', saveProgress)
        }
    }, [saveProgress])

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
            // Đừng cướp phím tắt của trình duyệt (Ctrl+F, Cmd+R…).
            if (e.ctrlKey || e.metaKey || e.altKey) return
            // Chỉ nhường cho ô nhập CHỮ. Thanh âm lượng cũng là <input> nhưng
            // chặn ở đó thì chạm vào nó một lần là mọi phím tắt chết.
            if (isTextEntry(e.target)) return
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

    // ── bật/tắt track phụ đề ──
    useEffect(() => {
        const v = videoRef.current
        if (!v) return
        const wantedIndex = activeSub ? subtitles.findIndex((s) => s.id === activeSub) : -1

        const apply = () => {
            const tracks = Array.from(v.textTracks)
            // Ghép theo THỨ TỰ track phụ đề (bỏ qua track khác loại mà hls.js có
            // thể chèn vào), chứ không lấy chỉ số thô của textTracks.
            const subtitleTracks = tracks.filter((t) => t.kind === 'subtitles' || t.kind === 'captions')
            subtitleTracks.forEach((t, i) => {
                // 'hidden' chứ KHÔNG phải 'showing': cue vẫn nạp và vẫn chạy, chỉ
                // là trình duyệt không tự vẽ — EntSubtitleLayer vẽ lấy để kiểm
                // soát được phông, viền, bóng và cỡ chữ (xem tệp đó).
                // Track không dùng để 'disabled' cho khỏi tải, và để lớp vẽ nhận
                // ra track đang bật chỉ bằng một dấu hiệu: mode === 'hidden'.
                t.mode = i === wantedIndex ? 'hidden' : 'disabled'
            })
        }
        apply()
        // Track nạp bất đồng bộ — hls.js/HLS gốc có thể thêm track sau khi mount.
        v.textTracks.addEventListener?.('addtrack', apply)
        return () => v.textTracks.removeEventListener?.('addtrack', apply)
    }, [activeSub, subtitles, c.ready])

    // Không tải được tệp phụ đề thì phải NÓI — im lặng là người xem tưởng phim
    // không có phụ đề và đi tìm bản khác.
    const onTrackError = useCallback(() => {
        setSubError('Không tải được tệp phụ đề này.')
        setTimeout(() => setSubError(null), 6000)
    }, [])

    // ── bấm vào mặt video ──
    const onSurfacePointerUp = (e: React.PointerEvent) => {
        const coarse = e.pointerType === 'touch' || e.pointerType === 'pen'
        // Trên máy cảm ứng: chạm khi điều khiển đang ẩn chỉ để HIỆN nó ra.
        if (coarse && !showControls) {
            poke()
            return
        }
        poke()
        // Hoãn lệnh phát/dừng để nhường cho bấm đúp (toàn màn hình).
        if (clickTimer.current) clearTimeout(clickTimer.current)
        clickTimer.current = setTimeout(() => {
            setFlash(c.isPlaying ? 'pause' : 'play')
            setTimeout(() => setFlash(null), 450)
            c.toggle()
        }, DOUBLE_CLICK_WINDOW_MS)
    }

    const onSurfaceDoubleClick = () => {
        if (clickTimer.current) {
            clearTimeout(clickTimer.current)
            clickTimer.current = null
        }
        toggleFullscreen()
    }

    return (
        <div
            ref={shellRef}
            onMouseMove={poke}
            className={`relative flex select-none flex-col bg-black ${
                pseudoFs ? 'fixed inset-0 z-50 h-[100dvh] w-screen' : 'h-[100dvh] w-full'
            } ${showControls ? '' : 'cursor-none'}`}
        >
            {/* Bề mặt video */}
            <div
                className="relative flex-1 overflow-hidden"
                onPointerUp={onSurfacePointerUp}
                onDoubleClick={onSurfaceDoubleClick}
            >
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
                            srcLang={s.lang ?? 'vi'}
                            src={`/api/ent/videos/${videoId}/subtitles/${s.id}`}
                            onError={onTrackError}
                        />
                    ))}
                </video>

                {/* Phụ đề — vẽ tay, bám theo khung hình thật chứ không theo cửa sổ */}
                <EntSubtitleLayer
                    videoRef={videoRef}
                    activeSubtitleId={activeSub}
                    sizePct={subSizePct(subSize)}
                    lifted={showControls}
                />

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
                {/* Khựng vì đang nạp thêm dữ liệu — không có chỉ báo thì người xem
                    tưởng phim đứng hình. */}
                {c.ready && c.stalled && !c.error && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
                    </div>
                )}
                {c.error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center">
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                        <p className="text-zinc-300">{c.error}</p>
                    </div>
                )}

                {subError && (
                    <div className="pointer-events-none absolute bottom-28 left-1/2 -translate-x-1/2 rounded-lg bg-red-500/90 px-3 py-1.5 text-xs text-white">
                        {subError}
                    </div>
                )}
            </div>

            {/* Thanh trên: nút quay lại + tên phim */}
            <div
                className={`absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/80 to-transparent px-4 py-4 transition-opacity duration-200 ${
                    showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            >
                <Link
                    href="/entertainment"
                    className="rounded-lg p-2 text-white transition-colors hover:bg-white/10"
                    title="Về kho phim"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-sm font-medium text-white md:text-base">{title}</h1>
            </div>

            {/* Thanh điều khiển — GIỮ TRONG DOM khi ẩn, chỉ mờ đi. Tháo ra sẽ làm
                menu đang mở biến mất và ngắt cả thao tác kéo tua dở dang. */}
            <div
                className={`absolute inset-x-0 bottom-0 transition-opacity duration-200 ${
                    showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
            >
                <EntPlayerControls
                    c={c}
                    isFullscreen={isFullscreen || pseudoFs}
                    onToggleFullscreen={toggleFullscreen}
                    subtitles={subtitles}
                    activeSubtitleId={activeSub}
                    onSelectSubtitle={setActiveSub}
                    sync={sync}
                    subSize={subSize}
                    onSubSizeChange={changeSubSize}
                    onHoldChange={setHoldOpen}
                />
            </div>
        </div>
    )
}
