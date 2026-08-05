'use client'

// [Giải trí] Thanh điều khiển kiểu trang xem phim.
// Bố cục theo quy ước chung (Netflix/YouTube): thanh tua chiếm trọn bề ngang ở
// trên, hàng nút bên dưới; nhóm trái = phát/tua/âm lượng/thời gian, nhóm phải =
// phụ đề/cài đặt/toàn màn hình.

import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Play, Pause, Volume2, VolumeX, Volume1, Maximize, Minimize,
    Settings, Subtitles, RotateCcw, RotateCw,
} from 'lucide-react'
import type { EntPlayerController } from './useEntPlayer'

export interface SubtitleOption {
    id: string
    label: string
    lang: string | null
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function fmtTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) sec = 0
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = Math.floor(sec % 60)
    const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
    return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

export default function EntPlayerControls(props: {
    c: EntPlayerController
    isFullscreen: boolean
    onToggleFullscreen: () => void
    subtitles: SubtitleOption[]
    activeSubtitleId: string | null
    onSelectSubtitle: (id: string | null) => void
}) {
    const { c, isFullscreen, onToggleFullscreen, subtitles, activeSubtitleId, onSelectSubtitle } = props
    const railRef = useRef<HTMLDivElement>(null)
    const [scrubbing, setScrubbing] = useState(false)
    const [hoverSec, setHoverSec] = useState<number | null>(null)
    const [menu, setMenu] = useState<null | 'settings' | 'subs'>(null)

    const dur = c.durationSec || 0
    const pct = dur ? (c.currentSec / dur) * 100 : 0
    const bufPct = dur ? (c.bufferedSec / dur) * 100 : 0

    const secAtClientX = (clientX: number): number => {
        const el = railRef.current
        if (!el || !dur) return 0
        const rect = el.getBoundingClientRect()
        return ((clientX - rect.left) / rect.width) * dur
    }

    const onRailDown = (e: React.PointerEvent) => {
        if (!dur) return
        e.currentTarget.setPointerCapture(e.pointerId)
        setScrubbing(true)
        c.seekTo(secAtClientX(e.clientX))
    }
    const onRailMove = (e: React.PointerEvent) => {
        if (!dur) return
        setHoverSec(secAtClientX(e.clientX))
        if (scrubbing) c.seekTo(secAtClientX(e.clientX))
    }
    const onRailUp = (e: React.PointerEvent) => {
        if (scrubbing) {
            e.currentTarget.releasePointerCapture(e.pointerId)
            setScrubbing(false)
        }
    }

    const VolumeIcon = c.muted || c.volume === 0 ? VolumeX : c.volume < 0.5 ? Volume1 : Volume2
    const qualityLabel =
        c.currentLevel === -1 ? 'Tự động' : (c.levels.find((l) => l.index === c.currentLevel)?.label ?? 'Tự động')

    return (
        <div
            className="bg-gradient-to-t from-black/95 via-black/70 to-transparent px-3 pb-3 pt-10 md:px-5 md:pb-4"
            // Bấm vào thanh điều khiển KHÔNG được lọt xuống bề mặt video (bề mặt đó
            // đang bắt click để play/pause).
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
        >
            {/* Thanh tua */}
            <div
                ref={railRef}
                onPointerDown={onRailDown}
                onPointerMove={onRailMove}
                onPointerUp={onRailUp}
                onPointerLeave={() => setHoverSec(null)}
                className="group/rail relative -mx-1 cursor-pointer px-1 py-2.5"
            >
                <div className="relative h-1 w-full rounded-full bg-white/20 transition-all group-hover/rail:h-1.5">
                    <div className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${bufPct}%` }} />
                    <div className="absolute inset-y-0 left-0 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    <div
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-400 opacity-0 shadow transition-opacity group-hover/rail:opacity-100"
                        style={{ left: `${pct}%`, opacity: scrubbing ? 1 : undefined }}
                    />
                </div>
                {hoverSec != null && dur > 0 && (
                    <div
                        className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] tabular-nums text-white"
                        style={{ left: `${(hoverSec / dur) * 100}%` }}
                    >
                        {fmtTime(hoverSec)}
                    </div>
                )}
            </div>

            {/* Hàng nút */}
            <div className="flex items-center gap-1 text-white md:gap-2">
                <IconBtn onClick={c.toggle} label={c.isPlaying ? 'Tạm dừng (K)' : 'Phát (K)'}>
                    {c.isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
                </IconBtn>

                <IconBtn onClick={() => c.nudge(-10)} label="Lùi 10 giây (←)">
                    <span className="relative flex items-center justify-center">
                        <RotateCcw className="h-5 w-5" />
                        <span className="absolute text-[8px] font-bold">10</span>
                    </span>
                </IconBtn>
                <IconBtn onClick={() => c.nudge(10)} label="Tiến 10 giây (→)">
                    <span className="relative flex items-center justify-center">
                        <RotateCw className="h-5 w-5" />
                        <span className="absolute text-[8px] font-bold">10</span>
                    </span>
                </IconBtn>

                {/* Âm lượng: rê vào mới hiện thanh trượt, đúng nếp các trang xem phim */}
                <div className="group/vol flex items-center">
                    <IconBtn onClick={c.toggleMute} label={c.muted ? 'Bật tiếng (M)' : 'Tắt tiếng (M)'}>
                        <VolumeIcon className="h-5 w-5" />
                    </IconBtn>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={c.muted ? 0 : c.volume}
                        onChange={(e) => c.setVolume(Number(e.target.value))}
                        aria-label="Âm lượng"
                        className="ent-vol h-1 w-0 cursor-pointer opacity-0 transition-all duration-200 group-hover/vol:ml-2 group-hover/vol:w-20 group-hover/vol:opacity-100 focus:ml-2 focus:w-20 focus:opacity-100"
                    />
                </div>

                <span className="ml-1 select-none text-xs tabular-nums text-white/80 md:text-sm">
                    {fmtTime(c.currentSec)} <span className="text-white/40">/ {fmtTime(dur)}</span>
                </span>

                <div className="flex-1" />

                {subtitles.length > 0 && (
                    <div className="relative">
                        <IconBtn
                            onClick={() => setMenu(menu === 'subs' ? null : 'subs')}
                            label="Phụ đề (C)"
                            active={!!activeSubtitleId}
                        >
                            <Subtitles className="h-5 w-5" />
                        </IconBtn>
                        <AnimatePresence>
                            {menu === 'subs' && (
                                <Menu onClose={() => setMenu(null)}>
                                    <MenuItem
                                        active={activeSubtitleId === null}
                                        onClick={() => {
                                            onSelectSubtitle(null)
                                            setMenu(null)
                                        }}
                                    >
                                        Tắt
                                    </MenuItem>
                                    {subtitles.map((s) => (
                                        <MenuItem
                                            key={s.id}
                                            active={activeSubtitleId === s.id}
                                            onClick={() => {
                                                onSelectSubtitle(s.id)
                                                setMenu(null)
                                            }}
                                        >
                                            {s.label}
                                        </MenuItem>
                                    ))}
                                </Menu>
                            )}
                        </AnimatePresence>
                    </div>
                )}

                <div className="relative">
                    <IconBtn onClick={() => setMenu(menu === 'settings' ? null : 'settings')} label="Cài đặt">
                        <Settings className="h-5 w-5" />
                    </IconBtn>
                    <AnimatePresence>
                        {menu === 'settings' && (
                            <Menu onClose={() => setMenu(null)}>
                                <MenuLabel>Tốc độ</MenuLabel>
                                <div className="flex flex-wrap gap-1 px-2 pb-2">
                                    {SPEEDS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => c.setRate(s)}
                                            className={`rounded px-2 py-1 text-xs transition-colors ${
                                                c.playbackRate === s
                                                    ? 'bg-amber-500/20 text-amber-200'
                                                    : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
                                            }`}
                                        >
                                            {s === 1 ? 'Chuẩn' : `${s}×`}
                                        </button>
                                    ))}
                                </div>
                                <MenuLabel>Chất lượng</MenuLabel>
                                {c.nativeHls ? (
                                    <p className="px-3 pb-2 text-[11px] text-zinc-500">
                                        Trình duyệt này tự chọn chất lượng.
                                    </p>
                                ) : c.levels.length === 0 ? (
                                    <p className="px-3 pb-2 text-[11px] text-zinc-500">Đang tải…</p>
                                ) : (
                                    <>
                                        <MenuItem active={c.currentLevel === -1} onClick={() => c.setLevel(-1)}>
                                            Tự động
                                        </MenuItem>
                                        {[...c.levels]
                                            .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
                                            .map((l) => (
                                                <MenuItem
                                                    key={l.index}
                                                    active={c.currentLevel === l.index}
                                                    onClick={() => c.setLevel(l.index)}
                                                >
                                                    {l.label}
                                                </MenuItem>
                                            ))}
                                    </>
                                )}
                            </Menu>
                        )}
                    </AnimatePresence>
                </div>

                <IconBtn onClick={onToggleFullscreen} label={isFullscreen ? 'Thoát toàn màn hình (F)' : 'Toàn màn hình (F)'}>
                    {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </IconBtn>
            </div>

            {/* Nhãn chất lượng hiện hành — nhỏ, chỉ để biết đang xem mức nào */}
            {!c.nativeHls && c.levels.length > 0 && (
                <div className="mt-1 text-right text-[10px] text-white/35">{qualityLabel}</div>
            )}

            <style jsx global>{`
                .ent-vol {
                    -webkit-appearance: none;
                    appearance: none;
                    background: rgba(255, 255, 255, 0.3);
                    border-radius: 999px;
                }
                .ent-vol::-webkit-slider-thumb {
                    -webkit-appearance: none;
                    height: 12px;
                    width: 12px;
                    border-radius: 999px;
                    background: #fbbf24;
                }
                .ent-vol::-moz-range-thumb {
                    height: 12px;
                    width: 12px;
                    border: none;
                    border-radius: 999px;
                    background: #fbbf24;
                }
            `}</style>
        </div>
    )
}

function IconBtn({
    children,
    onClick,
    label,
    active,
}: {
    children: React.ReactNode
    onClick: () => void
    label: string
    active?: boolean
}) {
    return (
        <button
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`rounded-lg p-2 transition-colors hover:bg-white/10 ${active ? 'text-amber-400' : 'text-white'}`}
        >
            {children}
        </button>
    )
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <>
            {/* Lớp phủ bắt click ra ngoài để đóng menu */}
            <div className="fixed inset-0 z-10" onClick={onClose} />
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full right-0 z-20 mb-2 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-zinc-950/95 py-1 shadow-2xl backdrop-blur-xl"
            >
                {children}
            </motion.div>
        </>
    )
}

function MenuLabel({ children }: { children: React.ReactNode }) {
    return <div className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">{children}</div>
}

function MenuItem({
    children,
    active,
    onClick,
}: {
    children: React.ReactNode
    active?: boolean
    onClick: () => void
}) {
    return (
        <button
            onClick={onClick}
            className={`block w-full px-3 py-1.5 text-left text-sm transition-colors ${
                active ? 'bg-amber-500/15 text-amber-200' : 'text-zinc-300 hover:bg-white/5'
            }`}
        >
            {children}
        </button>
    )
}
