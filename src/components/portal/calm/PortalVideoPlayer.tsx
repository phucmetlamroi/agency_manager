'use client'

/**
 * [B5/P4] Minimal client-facing Mux player embedded in the share portal.
 *
 * The client watches the READY review cut RIGHT HERE (their token-gated portal) instead of
 * being bounced to a guest /r/{slug} link — which fixes "khách không xem được video trong
 * portal". This is a *watch* surface only (no timecode comments / annotations — those live in
 * the internal review + guest experiences); Approve / Request-changes stay in the panel below.
 *
 * Playback uses short-lived signed Mux tokens minted server-side in getShareSnapshot (no DB
 * write). Safari plays HLS natively; everywhere else we attach hls.js (dynamically imported so
 * it never touches the server bundle).
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
    playbackId: string
    tokens: { playback: string; thumbnail: string; storyboard: string }
}

const hlsSrc = (playbackId: string, token: string) => `https://stream.mux.com/${playbackId}.m3u8?token=${token}`
const posterSrc = (playbackId: string, token: string) =>
    `https://image.mux.com/${playbackId}/thumbnail.webp?token=${token}`

export function PortalVideoPlayer({ playbackId, tokens }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        const video = videoRef.current
        if (!video) return
        const src = hlsSrc(playbackId, tokens.playback)
        let hls: { destroy: () => void } | null = null
        let cancelled = false

        // Safari / iOS: native HLS. Everywhere else: hls.js.
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = src
        } else {
            import('hls.js')
                .then(({ default: Hls }) => {
                    if (cancelled || !videoRef.current) return
                    if (Hls.isSupported()) {
                        const instance = new Hls({ enableWorker: true })
                        instance.on(Hls.Events.ERROR, (_e, data) => {
                            if (data?.fatal) setError(true)
                        })
                        instance.loadSource(src)
                        instance.attachMedia(videoRef.current)
                        hls = instance
                    } else {
                        // Last resort — let the browser try the manifest directly.
                        videoRef.current.src = src
                    }
                })
                .catch(() => setError(true))
        }

        return () => {
            cancelled = true
            if (hls) hls.destroy()
        }
    }, [playbackId, tokens.playback])

    if (error) {
        return (
            <div style={{ padding: 16, borderRadius: 14, background: 'var(--surface-2)', border: '1px solid var(--line-2)', fontSize: 13, color: 'var(--fg-2)' }}>
                The video couldn’t load. Please refresh the page and try again.
            </div>
        )
    }

    return (
        <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line-2)', background: '#000', boxShadow: 'var(--shadow-panel)' }}>
            <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                poster={posterSrc(playbackId, tokens.thumbnail)}
                style={{ display: 'block', width: '100%', height: 'auto', maxHeight: '70vh', background: '#000' }}
            />
        </div>
    )
}
