// [review-fixes P5 / FR-06] One side of the Compare view: a bare letterboxed <video>
// (object-contain → handles 16:9 AND 9:16 AND mismatched aspects, no orientation branch),
// a per-side version dropdown, a v-badge, and a click-to-activate overlay. It owns NO
// transport — CompareView drives both sides through useSyncedTransport. The <video>'s ref
// + controller are created by CompareView (so both hooks live under one PlayerEnvProvider).

'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, ChevronDown, Volume2, Layers } from 'lucide-react'
import type { VersionRow } from '@/lib/review/team-actions'
import type { PlayerController } from './useHlsPlayer'

export function CompareSide({
    versions,
    versionId,
    otherVersionId,
    onChangeVersion,
    videoRef,
    controller,
    isActive,
    onActivate,
    posterUrl,
}: {
    versions: VersionRow[]
    versionId: string
    /** The other side's current version — disabled in this dropdown (can't compare a version with itself). */
    otherVersionId: string
    onChangeVersion: (id: string) => void
    videoRef: React.RefObject<HTMLVideoElement | null>
    controller: PlayerController
    isActive: boolean
    onActivate: () => void
    posterUrl: string | null
}) {
    const [open, setOpen] = useState(false)
    const version = versions.find((v) => v.id === versionId) ?? null

    return (
        <div className={`relative flex min-h-0 flex-col bg-black ${isActive ? 'ring-2 ring-inset ring-indigo-400' : ''}`}>
            {/* top bar: v-badge + per-side selector + (active) audio indicator — above the activate overlay */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-2">
                <span className="pointer-events-auto grid h-7 min-w-9 place-items-center rounded bg-indigo-500/20 px-1.5 text-xs font-semibold text-indigo-200">
                    v{version?.versionNumber ?? '—'}
                </span>
                <div className="pointer-events-auto relative">
                    <button
                        onClick={() => setOpen((v) => !v)}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white/85 backdrop-blur hover:bg-black/70"
                    >
                        <Layers className="h-3.5 w-3.5 text-indigo-300" />
                        <span className="max-w-[9rem] truncate">{version?.originalName ?? 'Chọn phiên bản'}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-white/40" />
                    </button>
                    {open && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                            <div className="absolute left-0 top-9 z-40 max-h-[60vh] w-64 overflow-auto rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur">
                                {versions.map((v) => {
                                    const disabled = v.id === otherVersionId
                                    return (
                                        <button
                                            key={v.id}
                                            disabled={disabled}
                                            onClick={() => {
                                                onChangeVersion(v.id)
                                                setOpen(false)
                                            }}
                                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm ${
                                                v.id === versionId ? 'bg-white/5' : ''
                                            } ${disabled ? 'cursor-not-allowed opacity-30' : 'hover:bg-white/10'}`}
                                            title={disabled ? 'Đang so sánh ở bên kia' : undefined}
                                        >
                                            <span className="grid h-7 w-9 shrink-0 place-items-center rounded bg-indigo-500/15 text-xs font-semibold text-indigo-300">
                                                v{v.versionNumber}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-white/90">{v.originalName}</span>
                                                <span className="block text-xs text-white/40">{v.commentCount} bình luận</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </div>
                {isActive && (
                    <span className="pointer-events-auto ml-auto grid h-7 w-7 place-items-center rounded bg-indigo-500/20 text-indigo-200" title="Đang bật tiếng bên này">
                        <Volume2 className="h-4 w-4" />
                    </span>
                )}
            </div>

            {/* video surface */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                <video ref={videoRef} poster={posterUrl ?? undefined} playsInline className="h-full w-full object-contain" />
                {!controller.ready && !controller.error && (
                    <div className="absolute inset-0 grid place-items-center bg-black/40">
                        <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                    </div>
                )}
                {controller.error && (
                    <div className="absolute inset-0 grid place-items-center bg-black/60 px-6 text-center">
                        <div className="flex flex-col items-center gap-2 text-white/80">
                            <AlertTriangle className="h-8 w-8 text-amber-400" />
                            <p className="text-sm">{controller.error}</p>
                        </div>
                    </div>
                )}
                {/* click-to-activate: only on the NON-active side (the active side's clicks do nothing —
                    transport is shared, so a per-side toggle would desync). */}
                {!isActive && (
                    <button
                        onClick={onActivate}
                        className="absolute inset-0 z-10 cursor-pointer"
                        aria-label="Chọn bên này để bình luận"
                    />
                )}
            </div>
        </div>
    )
}
