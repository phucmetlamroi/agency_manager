// [Review module P4.2] The video surface: a letterboxed <video> (9:16-aware) with
// hls.js driven by the shell's controller, the control bar, an annotation-overlay
// slot (P4.4) and a timeline-markers slot (P4.3). Fullscreen uses the Fullscreen API
// on desktop and a CSS pseudo-fullscreen (100dvh) fallback for iPhone Safari where
// element fullscreen would hide the comment UI.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { Fps } from '@/lib/review/timecode'
import type { PlayerController } from './useHlsPlayer'
import { PlayerControls } from './PlayerControls'
import { usePlayerEnv } from './player-env'

export function VideoStage({
    videoRef,
    controller,
    fps,
    mediaKind,
    versionId,
    posterUrl,
    overlay,
    timelineChildren,
    clickToggleDisabled = false,
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    controller: PlayerController
    fps: Fps | null
    mediaKind: 'video' | 'image'
    versionId: string
    posterUrl: string | null
    overlay?: React.ReactNode
    timelineChildren?: React.ReactNode
    /** true while the annotation overlay is EDITABLE — disables click-to-play on the
     *  video surface (the element now covers the letterbox bars too, which the
     *  editable SVG does not, so a bar click would start playback mid-draw). */
    clickToggleDisabled?: boolean
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const env = usePlayerEnv()
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [pseudoFs, setPseudoFs] = useState(false)
    const [isTouch, setIsTouch] = useState(false)
    const [imgUrl, setImgUrl] = useState<string | null>(null)
    const [imgError, setImgError] = useState<string | null>(null)

    useEffect(() => {
        setIsTouch(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    }, [])

    // Image asset: fetch a short-lived presigned original to display (env-scoped
    // endpoint — internal download-url vs guest share route).
    useEffect(() => {
        if (mediaKind !== 'image') return
        let cancelled = false
        setImgUrl(null)
        setImgError(null)
        const fallback = env.lang === 'en' ? 'The image failed to load.' : 'Không tải được ảnh.'
        env.api
            .fetchImageUrl(versionId)
            .then((r) => !cancelled && setImgUrl(r.url))
            .catch((e) => !cancelled && setImgError(e instanceof Error ? e.message : fallback))
        return () => {
            cancelled = true
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mediaKind, versionId])

    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
        document.addEventListener('fullscreenchange', onFsChange)
        return () => document.removeEventListener('fullscreenchange', onFsChange)
    }, [])

    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current
        if (!el) return
        // Already in CSS pseudo-fullscreen (touch, or a rejected requestFullscreen
        // fallback on desktop) → the button must always be able to exit it.
        if (pseudoFs) {
            setPseudoFs(false)
            return
        }
        // iPhone Safari: element fullscreen would hide comment UI → pseudo-fullscreen.
        if (isTouch || !document.fullscreenEnabled) {
            setPseudoFs(true)
            return
        }
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else el.requestFullscreen().catch(() => setPseudoFs(true))
    }, [isTouch, pseudoFs])

    const fs = isFullscreen || pseudoFs

    return (
        <div
            ref={containerRef}
            className={
                pseudoFs
                    ? 'fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col bg-black select-none'
                    : 'relative flex h-full w-full flex-col bg-[#050505] select-none'
            }
        >
            {/* video / image area */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
                {mediaKind === 'video' ? (
                    <>
                        {/* h-full w-full + object-contain: the element's DISPLAY size is pinned
                            to the stage and the video letterboxes INSIDE it — with the old
                            max-h/max-w sizing the element tracked the intrinsic size of the
                            rendition being played, so an ABR switch (e.g. 480p → 1080p) made
                            the whole frame visibly jump/scale mid-playback. This box also now
                            matches the annotation overlay's containedBox math exactly. */}
                        <video
                            ref={videoRef}
                            poster={posterUrl ?? undefined}
                            playsInline
                            className="h-full w-full object-contain"
                            onClick={() => {
                                if (!clickToggleDisabled) controller.toggle()
                            }}
                        />
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
                    </>
                ) : imgError ? (
                    <div className="grid place-items-center px-6 text-center text-white/70">
                        <div className="flex flex-col items-center gap-2">
                            <AlertTriangle className="h-8 w-8 text-amber-400" />
                            <p className="text-sm">{imgError}</p>
                        </div>
                    </div>
                ) : imgUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                    <Loader2 className="h-8 w-8 animate-spin text-white/70" />
                )}

                {/* annotation overlay slot (P4.4) — sits above the media, below controls */}
                {overlay}
            </div>

            {/* controls (video only) — always an in-flow block BELOW the video (frame.io
                model). Previously non-fullscreen floated this as `absolute bottom-0`, which
                overlapped and hid the bottom of the letterboxed frame; the reviewer must be
                able to see the ENTIRE frame (nothing clipped) to catch errors in the lower
                content. The video area is `flex-1 min-h-0`, so it shrinks to make room. */}
            {mediaKind === 'video' && (
                <div className="shrink-0">
                    <PlayerControls
                        controller={controller}
                        fps={fps}
                        posterUrl={posterUrl}
                        isTouch={isTouch}
                        isFullscreen={fs}
                        onToggleFullscreen={toggleFullscreen}
                        timelineChildren={timelineChildren}
                    />
                </div>
            )}
        </div>
    )
}
