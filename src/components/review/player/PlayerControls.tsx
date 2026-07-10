// [Review module P4.2] Review-player transport. The timeline, comments, draft range,
// and playhead share one rail; below it, transport / timecode / playback settings stay
// in stable zones so reviewers can make frame-accurate feedback without visual drift.

'use client'

import { useId, useRef, useState } from 'react'
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    ChevronFirst,
    ChevronLast,
    ChevronDown,
    CornerDownLeft,
    Gauge,
    Settings2,
} from 'lucide-react'
import { frameToSeekTime, frameToSmpte, formatClock, nominalFps, timeToFrame, type Fps } from '@/lib/review/timecode'
import type { PlayerController } from './useHlsPlayer'
import { usePlayerEnv } from './player-env'
import { PLAYER_L10N } from './player-l10n'

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

function parseSeekTime(value: string, fps: Fps | null): number | null {
    const parts = value
        .trim()
        .split(':')
        .map((part) => (part === '' ? Number.NaN : Number(part)))
    if (parts.length < 1 || parts.length > 4 || parts.some((part) => !Number.isInteger(part) || part < 0)) return null

    if (parts.length === 4) {
        if (!fps) return null
        const [hours, minutes, seconds, frames] = parts
        if (minutes > 59 || seconds > 59 || frames >= nominalFps(fps)) return null
        const frame = ((hours * 3600 + minutes * 60 + seconds) * nominalFps(fps)) + frames
        return frameToSeekTime(frame, fps)
    }

    const padded = [0, 0, 0, ...parts].slice(-3)
    const [hours, minutes, seconds] = padded
    if (minutes > 59 || seconds > 59) return null
    return hours * 3600 + minutes * 60 + seconds
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
    const L = PLAYER_L10N[usePlayerEnv().lang]
    const trackRef = useRef<HTMLDivElement>(null)
    const timeInputId = useId()
    const [hover, setHover] = useState<{ x: number; sec: number } | null>(null)
    const [speedOpen, setSpeedOpen] = useState(false)
    const [qualOpen, setQualOpen] = useState(false)
    const [timecodeOpen, setTimecodeOpen] = useState(false)
    const [timeInput, setTimeInput] = useState('')
    const [mobileOptionsOpen, setMobileOptionsOpen] = useState(false)

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

    const toggleTimecode = () => {
        setTimeInput(tc(c.currentSec, fps))
        setTimecodeOpen((open) => !open)
        setSpeedOpen(false)
        setQualOpen(false)
        setMobileOptionsOpen(false)
    }

    const submitTimecode = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        const seconds = parseSeekTime(timeInput, fps)
        if (seconds == null) return
        c.seekToSeconds(Math.min(dur, seconds))
        setTimecodeOpen(false)
    }

    const hoverThumb = hover ? thumbAt(posterUrl, hover.sec) : null

    return (
        <div className="select-none border-t border-white/[0.14] bg-[#0a0c10]/96 px-3 pb-2 pt-2 shadow-[0_-14px_32px_rgba(0,0,0,0.4)] backdrop-blur-md">
            {/* The shared review rail keeps the draft range physically attached to seek and transport. */}
            <div
                ref={trackRef}
                className="group relative h-6 cursor-pointer touch-none"
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
                <div className="absolute left-0 right-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/[0.20]">
                    <div
                        className="absolute inset-y-0 left-0 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.58)]"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
                {timelineChildren}
                <div
                    className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0a0c10] bg-violet-100 shadow-[0_0_0_2px_rgba(167,139,250,0.84)]"
                    style={{ left: `${progress * 100}%` }}
                />
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

            {/* Frame.io-inspired transport: controls left, timecode centre, settings right. */}
            <div className="grid min-h-10 grid-cols-[auto_auto_auto] items-center justify-between gap-2 text-white sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="flex min-w-0 items-center gap-1">
                    <button
                        onClick={c.toggle}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-white transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                        aria-label={c.isPlaying ? L.pause : L.play}
                        title={c.isPlaying ? L.pause : L.play}
                    >
                        {c.isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>

                    <span className="h-4 w-px shrink-0 bg-white/[0.16]" aria-hidden="true" />

                    <div className="flex shrink-0 items-center">
                        <button
                            onClick={() => (isTouch ? c.seekToSeconds(c.currentSec - 1) : c.step(-10))}
                            className="hidden h-8 w-7 place-items-center rounded-l-md text-white/75 transition hover:bg-white/[0.12] hover:text-white sm:grid"
                            aria-label={isTouch ? L.back1s : L.backFrames(10)}
                            title={isTouch ? '-1s' : `-10 ${L.frameUnit}`}
                        >
                            <ChevronFirst className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => (isTouch ? c.seekToSeconds(c.currentSec - 1) : c.step(-1))}
                            className="grid h-8 w-7 place-items-center text-white/75 transition hover:bg-white/[0.12] hover:text-white"
                            aria-label={isTouch ? L.back1s : L.backFrames(1)}
                            title={isTouch ? '-1s' : `-1 ${L.frameUnit}`}
                        >
                            <ChevronFirst className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => (isTouch ? c.seekToSeconds(c.currentSec + 1) : c.step(1))}
                            className="grid h-8 w-7 place-items-center text-white/75 transition hover:bg-white/[0.12] hover:text-white"
                            aria-label={isTouch ? L.fwd1s : L.fwdFrames(1)}
                            title={isTouch ? '+1s' : `+1 ${L.frameUnit}`}
                        >
                            <ChevronLast className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={() => (isTouch ? c.seekToSeconds(c.currentSec + 1) : c.step(10))}
                            className="hidden h-8 w-7 place-items-center rounded-r-md text-white/75 transition hover:bg-white/[0.12] hover:text-white sm:grid"
                            aria-label={isTouch ? L.fwd1s : L.fwdFrames(10)}
                            title={isTouch ? '+1s' : `+10 ${L.frameUnit}`}
                        >
                            <ChevronLast className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                <div className="relative justify-self-center">
                    <button
                        type="button"
                        onClick={toggleTimecode}
                        className="flex h-8 items-center gap-1 rounded-md border border-white/[0.14] bg-black/35 px-2 font-mono text-[11px] font-medium tabular-nums text-white shadow-inner shadow-black/20 transition hover:border-white/[0.25] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                        aria-label="Đi tới timecode"
                        title="Đi tới timecode"
                    >
                        <span>{tc(c.currentSec, fps)}</span>
                        <span className="hidden text-white/45 lg:inline">/ {tc(dur, fps)}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-white/55 transition ${timecodeOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {timecodeOpen && (
                        <form
                            onSubmit={submitTimecode}
                            className="absolute bottom-10 left-1/2 z-30 flex w-44 -translate-x-1/2 items-center gap-1 rounded-md border border-white/[0.16] bg-[#171a20] p-1.5 shadow-2xl"
                        >
                            <label className="sr-only" htmlFor={timeInputId}>
                                Timecode
                            </label>
                            <input
                                id={timeInputId}
                                value={timeInput}
                                onChange={(e) => setTimeInput(e.target.value)}
                                className="h-8 min-w-0 flex-1 rounded border border-white/[0.12] bg-black/30 px-2 font-mono text-xs tabular-nums text-white outline-none placeholder:text-white/35 focus:border-violet-300"
                                autoFocus
                            />
                            <button
                                type="submit"
                                className="grid h-8 w-8 shrink-0 place-items-center rounded bg-violet-500 text-white transition hover:bg-violet-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                                aria-label="Đi tới timecode đã nhập"
                                title="Đi tới timecode đã nhập"
                            >
                                <CornerDownLeft className="h-4 w-4" />
                            </button>
                        </form>
                    )}
                </div>

                <div className="flex min-w-0 items-center justify-self-end gap-0.5">
                    <button
                        onClick={c.toggleMute}
                        className="hidden h-8 w-8 place-items-center rounded-md text-white/75 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 sm:grid"
                        aria-label={c.muted ? L.unmute : L.mute}
                        title={c.muted ? L.unmute : L.mute}
                    >
                        {c.muted || c.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>

                    <div className="relative hidden sm:block">
                        <button
                            onClick={() => {
                                setSpeedOpen((open) => !open)
                                setQualOpen(false)
                                setTimecodeOpen(false)
                            }}
                            className="flex h-8 items-center gap-1 rounded-md px-1.5 text-white/75 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                            aria-label={L.speed}
                            title={L.speed}
                        >
                            <Gauge className="h-4 w-4" />
                            <span className="text-[11px] font-medium">{c.playbackRate}x</span>
                        </button>
                        {speedOpen && (
                            <div className="absolute bottom-10 right-0 z-30 w-24 rounded-md border border-white/[0.16] bg-[#171a20] p-1 shadow-2xl">
                                {SPEEDS.map((speed) => (
                                    <button
                                        key={speed}
                                        onClick={() => {
                                            c.setRate(speed)
                                            setSpeedOpen(false)
                                        }}
                                        className={`block w-full rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.10] ${
                                            c.playbackRate === speed ? 'bg-violet-400/[0.10] text-violet-200' : 'text-white/80'
                                        }`}
                                    >
                                        {speed}x
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {!c.nativeHls && c.levels.length > 0 && (
                        <div className="relative hidden sm:block">
                            <button
                                onClick={() => {
                                    setQualOpen((open) => !open)
                                    setSpeedOpen(false)
                                    setTimecodeOpen(false)
                                }}
                                className="grid h-8 w-8 place-items-center rounded-md text-white/75 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                                aria-label={L.quality}
                                title={L.quality}
                            >
                                <Settings2 className="h-4 w-4" />
                            </button>
                            {qualOpen && (
                                <div className="absolute bottom-10 right-0 z-30 w-28 rounded-md border border-white/[0.16] bg-[#171a20] p-1 shadow-2xl">
                                    <button
                                        onClick={() => {
                                            c.setLevel(-1)
                                            setQualOpen(false)
                                        }}
                                        className={`block w-full rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.10] ${
                                            c.currentLevel === -1 ? 'bg-violet-400/[0.10] text-violet-200' : 'text-white/80'
                                        }`}
                                    >
                                        {L.autoQuality}
                                    </button>
                                    {c.levels
                                        .slice()
                                        .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
                                        .map((level) => (
                                            <button
                                                key={level.index}
                                                onClick={() => {
                                                    c.setLevel(level.index)
                                                    setQualOpen(false)
                                                }}
                                                className={`block w-full rounded px-2 py-1.5 text-left text-xs transition hover:bg-white/[0.10] ${
                                                    c.currentLevel === level.index ? 'bg-violet-400/[0.10] text-violet-200' : 'text-white/80'
                                                }`}
                                            >
                                                {level.label}
                                            </button>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="relative sm:hidden">
                        <button
                            type="button"
                            onClick={() => {
                                setMobileOptionsOpen((open) => !open)
                                setTimecodeOpen(false)
                                setSpeedOpen(false)
                                setQualOpen(false)
                            }}
                            className="grid h-8 w-8 place-items-center rounded-md text-white/75 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                            aria-label="Tùy chọn phát"
                            title="Tùy chọn phát"
                            aria-expanded={mobileOptionsOpen}
                        >
                            <Settings2 className="h-4 w-4" />
                        </button>
                        {mobileOptionsOpen && (
                            <div className="absolute bottom-10 right-0 z-30 w-36 rounded-md border border-white/[0.16] bg-[#171a20] p-1.5 shadow-2xl">
                                <div className="grid grid-cols-2 gap-1">
                                    <button
                                        onClick={c.toggleMute}
                                        className="grid h-8 place-items-center rounded text-white/80 transition hover:bg-white/[0.10]"
                                        aria-label={c.muted ? L.unmute : L.mute}
                                        title={c.muted ? L.unmute : L.mute}
                                    >
                                        {c.muted || c.volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                                    </button>
                                    {SPEEDS.map((speed) => (
                                        <button
                                            key={speed}
                                            onClick={() => {
                                                c.setRate(speed)
                                                setMobileOptionsOpen(false)
                                            }}
                                            className={`h-8 rounded text-xs font-medium transition hover:bg-white/[0.10] ${
                                                c.playbackRate === speed ? 'bg-violet-400/[0.12] text-violet-200' : 'text-white/80'
                                            }`}
                                        >
                                            {speed}x
                                        </button>
                                    ))}
                                </div>
                                {!c.nativeHls && c.levels.length > 0 && (
                                    <div className="mt-1 grid grid-cols-2 gap-1 border-t border-white/[0.10] pt-1">
                                        <button
                                            onClick={() => {
                                                c.setLevel(-1)
                                                setMobileOptionsOpen(false)
                                            }}
                                            className={`h-8 rounded text-xs font-medium transition hover:bg-white/[0.10] ${
                                                c.currentLevel === -1 ? 'bg-violet-400/[0.12] text-violet-200' : 'text-white/80'
                                            }`}
                                        >
                                            {L.autoQuality}
                                        </button>
                                        {c.levels
                                            .slice()
                                            .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
                                            .map((level) => (
                                                <button
                                                    key={level.index}
                                                    onClick={() => {
                                                        c.setLevel(level.index)
                                                        setMobileOptionsOpen(false)
                                                    }}
                                                    className={`h-8 rounded text-xs font-medium transition hover:bg-white/[0.10] ${
                                                        c.currentLevel === level.index ? 'bg-violet-400/[0.12] text-violet-200' : 'text-white/80'
                                                    }`}
                                                >
                                                    {level.label}
                                                </button>
                                            ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={onToggleFullscreen}
                        className="grid h-8 w-8 place-items-center rounded-md text-white/75 transition hover:bg-white/[0.12] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
                        aria-label={isFullscreen ? L.exitFullscreen : L.enterFullscreen}
                        title={isFullscreen ? L.exitFullscreen : L.enterFullscreen}
                    >
                        {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </button>
                </div>
            </div>
        </div>
    )
}
