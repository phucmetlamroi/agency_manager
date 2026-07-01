'use client'

/**
 * [Video Review] Cloudflare Stream player wrapper. Loads the Stream Player SDK
 * from the CDN (no npm dep) and drives the signed iframe embed. Exposes an
 * imperative handle so the review UI can read the playhead (to stamp a comment
 * with a timecode) and seek (to jump to a comment).
 */

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

declare global {
    interface Window { Stream?: (el: HTMLIFrameElement) => StreamPlayer }
}
interface StreamPlayer {
    currentTime: number
    play: () => Promise<void> | void
    pause: () => void
    addEventListener: (ev: string, cb: () => void) => void
    removeEventListener: (ev: string, cb: () => void) => void
}

const SDK_SRC = 'https://embed.cloudflarestream.com/embed/sdk.latest.js'
let sdkPromise: Promise<void> | null = null
function loadStreamSdk(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    if (window.Stream) return Promise.resolve()
    if (sdkPromise) return sdkPromise
    sdkPromise = new Promise<void>((resolve, reject) => {
        const s = document.createElement('script')
        s.src = SDK_SRC
        s.async = true
        s.onload = () => resolve()
        s.onerror = () => { sdkPromise = null; reject(new Error('stream sdk load failed')) }
        document.head.appendChild(s)
    })
    return sdkPromise
}

export interface ReviewPlayerHandle {
    getTime: () => number
    seekTo: (sec: number) => void
    pause: () => void
}

const ReviewPlayer = forwardRef<ReviewPlayerHandle, {
    iframeUrl: string
    onTime?: (sec: number) => void
}>(function ReviewPlayer({ iframeUrl, onTime }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null)
    const playerRef = useRef<StreamPlayer | null>(null)
    const timeRef = useRef(0)
    const onTimeRef = useRef(onTime)
    onTimeRef.current = onTime

    useEffect(() => {
        let cancelled = false
        let player: StreamPlayer | null = null
        const handle = () => {
            const t = player?.currentTime ?? 0
            timeRef.current = t
            onTimeRef.current?.(t)
        }
        loadStreamSdk().then(() => {
            if (cancelled || !iframeRef.current || !window.Stream) return
            player = window.Stream(iframeRef.current)
            playerRef.current = player
            player.addEventListener('timeupdate', handle)
            player.addEventListener('seeked', handle)
        }).catch(() => { /* SDK/network unavailable — iframe still plays with its own controls */ })
        return () => {
            cancelled = true
            try { player?.removeEventListener('timeupdate', handle); player?.removeEventListener('seeked', handle) } catch { /* noop */ }
            playerRef.current = null
        }
    }, [iframeUrl])

    useImperativeHandle(ref, () => ({
        getTime: () => (playerRef.current?.currentTime ?? timeRef.current) || 0,
        seekTo: (sec: number) => { if (playerRef.current) { try { playerRef.current.currentTime = sec } catch { /* noop */ } } },
        pause: () => { try { playerRef.current?.pause() } catch { /* noop */ } },
    }), [])

    return (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', maxHeight: '62vh', background: '#0b0b0d', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line-2)' }}>
            <iframe
                ref={iframeRef}
                key={iframeUrl}
                src={iframeUrl}
                title="Video review"
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                style={{ border: 0, position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
        </div>
    )
})

export default ReviewPlayer
