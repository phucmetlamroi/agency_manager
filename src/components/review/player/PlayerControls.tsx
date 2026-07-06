// [Review module P4.2] Player control bar (PRD FR-E01/E02). Play/pause, a custom
// scrub timeline with hover-scrub thumbnail (Mux thumbnail token reused from the
// poster URL), SMPTE timecode, speed presets, quality pin (hidden on native-HLS /
// iPhone — Auto only), frame-step ±1/±10 (touch → ±1s), mute, fullscreen. The
// timeline hosts comment markers passed as `timelineChildren` (P4.3).

'use client'

import { useRef, useState } from 'react'
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    ChevronFirst,
    ChevronLast,
    Gauge,
    Settings2,
} from 'lucide-react'
import { frameToSmpte, formatClock, timeToFrame, type Fps } from '@/lib/review/timecode'
import type { PlayerController } from './useHlsPlayer'

const SPEEDS = [0.25, 0.5, 1, 1.5, 2]

function thumbAt(posterUrl: string | null, sec: number): string | null {
    if (!posterUrl) return null
    try {
        const u = new URL(posterUrl)
        u.searchParams.set('time', String(Math.max(0, Math.floor(sec))))
        u.searchParams.set('width', '240')
        return u.toString()
    } catch {
        return null
    }
}

function tc(sec: number, fps: Fps | null): string {
    if (fps) return frameToSmpte(timeToFrame(sec, fps), fps)
    return formatClock(sec)
}

export function PlayerControls({
    controller,
    fps,
    posterUrl,
    isTouch,
    isFullscreen,
    onToggleFullscreen,
    timelineChildren,
}: {
    controller: PlayerController
    fps: Fps | null
    posterUrl: string | null
    isTouch: boolean
    isFullscreen: boolean
    onToggleFullscreen: () => void
    timelineChildren?: React.ReactNode
}) {
    const c = controller
    const trackRef = useRef<HTMLDivElement>(null)
    const [hover, setHover] = useState<{ x: number; sec: number } | null>(null)
    const [speedOpen, setSpeedOpen] = useState(false)
    const [qualOpen, setQualOpen] = useState(false)

    const dur = c.durationSec || 0
    const progress = dur > 0 ? Math.min(1, c.currentSec / dur) : 0

    const seekFromEvent = (clientX: number) => {
        const el = trackRef.current
        if (!el || dur <= 0) return
        const rect = el.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
        c.seekToSeconds(ratio * dur)
    }
    const onTrackMove = (e: React.PointerEvent) => {
        const el = trackRef.current
        if (!el || dur <= 0) return
        const rect = el.getBoundingClientRect()
        const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left))
        setHover({ x, sec: (x / rect.width) * dur })
    }

    const hoverThumb = hover ? thumbAt(posterUrl, hover.sec) : null

    return (
        <div className="select-none bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 pb-3 pt-8">
            {/* Timeline */}
            <div
                ref={trackRef}
                className="group relative mb-2 h-6 cursor-pointer"
                onPointerDown={(e) => {
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                    seekFromEvent(e.clientX)
                }}
                onPointerMove={(e) => {
                    onTrackMove(e)
                    if (e.buttons === 1) seekFromEvent(e.clientX)
                }}
                onPointerLeave={() => setHover(null)}
            >
                {/* rail */}
                <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/15">
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-indigo-400"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
                {/* markers slot (P4.3) */}
                {timelineChildren}
                {/* playhead knob */}
                <div
                    className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-2 ring-indigo-400"
                    style={{ left: `${progress * 100}%` }}
                />
                {/* hover thumbnail + time */}
                {hover && (
                    <div
                        className="pointer-events-none absolute bottom-7 z-10 -translate-x-1/2"
                        style={{ left: `${hover.x}px` }}
                    >
                        {hoverThumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={hoverThumb}
                                alt=""
                                className="mb-1 h-[68px] w-[120px] rounded-md border border-white/20 bg-black object-contain shadow-lg"
                            />
                        )}
                        <div className="mx-auto w-fit rounded bg-black/90 px-1.5 py-0.5 text-center font-mono text-[11px] text-white">
                            {tc(hover.sec, fps)}
                        </div>
                    </div>
                )}
            </div>

            {/* Buttons row */}
            <div className="flex items-center gap-1.5 text-white">
                <button
                    onClick={c.toggle}
                    className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"
                    aria-label={c.isPlaying ? 'Tạm dừng' : 'Phát'}
                >
                    {c.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </button>

                {/* frame step */}
                <div className="flex items-center rounded-lg bg-white/5">
                    <button
                        onClick={() => (isTouch ? c.seekToSeconds(c.currentSec - 1) : c.step(-10))}
                        className="grid h-9 w-9 place-items-center rounded-l-lg hover:bg-white/10"
                        aria-label={isTouch ? 'Lùi 1 giây' : 'Lùi 10 khung'}
                        title={isTouch ? '−1s' : '−10 khung'}
                    >
                        <ChevronFirst className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => (isTouch ? c.seekToSeconds(c.currentSec - 1) : c.step(-1))}
                        className="grid h-9 w-8 place-items-center hover:bg-white/10 font-mono text-xs"
                        aria-label={isTouch ? 'Lùi 1 giây' : 'Lùi 1 khung'}
                        title={isTouch ? '−1s' : '−1 khung'}
                    >
                        ‹
                    </button>
                    <button
                        onClick={() => (isTouch ? c.seekToSeconds(c.currentSec + 1) : c.step(1))}
                        className="grid h-9 w-8 place-items-center hover:bg-white/10 font-mono text-xs"
                        aria-label={isTouch ? 'Tiến 1 giây' : 'Tiến 1 khung'}
                        title={isTouch ? '+1s' : '+1 khung'}
                    >
                        ›
                    </button>
                    <button
                        onClick={() => (isTouch ? c.seekToSeconds(c.currentSec + 1) : c.step(10))}
                        className="grid h-9 w-9 place-items-center rounded-r-lg hover:bg-white/10"
                        aria-label={isTouch ? 'Tiến 1 giây' : 'Tiến 10 khung'}
                        title={isTouch ? '+1s' : '+10 khung'}
                    >
                        <ChevronLast className="h-4 w-4" />
                    </button>
                </div>

                {/* timecode */}
                <div className="ml-1 font-mono text-xs tabular-nums text-white/90">
                    {tc(c.currentSec, fps)}
                    <span className="text-white/40"> / {tc(dur, fps)}</span>
                </div>

                <div className="flex-1" />

                {/* volume */}
                <button
                    onClick={c.toggleMute}
                    className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"
                    aria-label={c.muted ? 'Bật tiếng' : 'Tắt tiếng'}
                >
                    {c.muted || c.volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>

                {/* speed */}
                <div className="relative">
                    <button
                        onClick={() => {
                            setSpeedOpen((v) => !v)
                            setQualOpen(false)
                        }}
                        className="flex h-9 items-center gap-1 rounded-lg px-2 hover:bg-white/10"
                        aria-label="Tốc độ phát"
                    >
                        <Gauge className="h-4 w-4" />
                        <span className="text-xs font-medium">{c.playbackRate}×</span>
                    </button>
                    {speedOpen && (
                        <div className="absolute bottom-11 right-0 z-20 w-24 rounded-lg border border-white/10 bg-zinc-900/95 p-1 shadow-xl backdrop-blur">
                            {SPEEDS.map((s) => (
                                <button
                                    key={s}
                                    onClick={() => {
                                        c.setRate(s)
                                        setSpeedOpen(false)
                                    }}
                                    className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                                        c.playbackRate === s ? 'text-indigo-400' : 'text-white/80'
                                    }`}
                                >
                                    {s}×
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* quality (hidden on native HLS / iPhone) */}
                {!c.nativeHls && c.levels.length > 0 && (
                    <div className="relative">
                        <button
                            onClick={() => {
                                setQualOpen((v) => !v)
                                setSpeedOpen(false)
                            }}
                            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"
                            aria-label="Chất lượng"
                        >
                            <Settings2 className="h-4 w-4" />
                        </button>
                        {qualOpen && (
                            <div className="absolute bottom-11 right-0 z-20 w-28 rounded-lg border border-white/10 bg-zinc-900/95 p-1 shadow-xl backdrop-blur">
                                <button
                                    onClick={() => {
                                        c.setLevel(-1)
                                        setQualOpen(false)
                                    }}
                                    className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                                        c.currentLevel === -1 ? 'text-indigo-400' : 'text-white/80'
                                    }`}
                                >
                                    Tự động
                                </button>
                                {c.levels
                                    .slice()
                                    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
                                    .map((lv) => (
                                        <button
                                            key={lv.index}
                                            onClick={() => {
                                                c.setLevel(lv.index)
                                                setQualOpen(false)
                                            }}
                                            className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                                                c.currentLevel === lv.index ? 'text-indigo-400' : 'text-white/80'
                                            }`}
                                        >
                                            {lv.label}
                                        </button>
                                    ))}
                            </div>
                        )}
                    </div>
                )}

                {/* fullscreen */}
                <button
                    onClick={onToggleFullscreen}
                    className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10"
                    aria-label={isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
                >
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </button>
            </div>
        </div>
    )
}
