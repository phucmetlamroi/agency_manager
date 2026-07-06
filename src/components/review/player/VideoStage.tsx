// [Review module P4.2] The video surface: a letterboxed <video> (9:16-aware) with
// hls.js driven by the shell's controller, the control bar, an annotation-overlay
// slot (P4.4) and a timeline-markers slot (P4.3). Fullscreen uses the Fullscreen API
// on desktop and a CSS pseudo-fullscreen (100dvh) fallback for iPhone Safari where
// element fullscreen would hide the comment UI.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { Fps } from '@/lib/review/timecode'
import { fetchDownloadUrl } from '@/lib/review/player-api'
import type { PlayerController } from './useHlsPlayer'
import { PlayerControls } from './PlayerControls'

export function VideoStage({
    videoRef,
    controller,
    fps,
    mediaKind,
    versionId,
    posterUrl,
    overlay,
    timelineChildren,
}: {
    videoRef: React.RefObject<HTMLVideoElement | null>
    controller: PlayerController
    fps: Fps | null
    mediaKind: 'video' | 'image'
    versionId: string
    posterUrl: string | null
    overlay?: React.ReactNode
    timelineChildren?: React.ReactNode
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [pseudoFs, setPseudoFs] = useState(false)
    const [isTouch, setIsTouch] = useState(false)
    const [imgUrl, setImgUrl] = useState<string | null>(null)
    const [imgError, setImgError] = useState<string | null>(null)

    useEffect(() => {
        setIsTouch(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
    }, [])

    // Image asset: fetch a short-lived presigned original to display.
    useEffect(() => {
        if (mediaKind !== 'image') return
        let cancelled = false
        setImgUrl(null)
        setImgError(null)
        fetchDownloadUrl(versionId)
            .then((r) => !cancelled && setImgUrl(r.url))
            .catch((e) => !cancelled && setImgError(e instanceof Error ? e.message : 'Không tải được ảnh.'))
        return () => {
            cancelled = true
        }
    }, [mediaKind, versionId])

    useEffect(() => {
        const onFsChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current)
        document.addEventListener('fullscreenchange', onFsChange)
        return () => document.removeEventListener('fullscreenchange', onFsChange)
    }, [])

    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current
        if (!el) return
        // iPhone Safari: element fullscreen would hide comment UI → pseudo-fullscreen.
        if (isTouch || !document.fullscreenEnabled) {
            setPseudoFs((v) => !v)
            return
        }
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else el.requestFullscreen().catch(() => setPseudoFs(true))
    }, [isTouch])

    const fs = isFullscreen || pseudoFs

    return (
        <div
            ref={containerRef}
            className={
                pseudoFs
                    ? 'fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col bg-black'
                    : 'relative flex h-full w-full flex-col bg-black'
            }
        >
            {/* video / image area */}
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                {mediaKind === 'video' ? (
                    <>
                        <video
                            ref={videoRef}
                            poster={posterUrl ?? undefined}
                            playsInline
                            className="max-h-full max-w-full"
                            onClick={() => controller.toggle()}
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

            {/* controls (video only) */}
            {mediaKind === 'video' && (
                <div className={fs ? '' : 'absolute inset-x-0 bottom-0'}>
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
