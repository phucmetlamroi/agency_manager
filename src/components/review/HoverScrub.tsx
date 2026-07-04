'use client'

// [Review module P2.3] Hover-scrub video preview (FR-B06). Drag horizontally across
// a READY video thumbnail → the frame follows the cursor, a thin playhead line marks
// the position, and a small timecode tooltip sits under it; mouse-leave returns to
// the poster. Frames come from the Mux storyboard.vtt (already signed + embedded in
// AssetDto.currentVersion.media.storyboardVttUrl by P1.7) — NO new route.
//
// Rendering: the VTT is a set of time-ranged cues, each pointing at a sprite image +
// an #xywh region. We clip the region with a fixed-size (w×h) div scaled to the card
// (transformOrigin top-left) — so no need to know the sprite's natural dimensions.
// The .vtt + sprites are fetched cross-origin straight from image.mux.com (allowed by
// CSP img-src/connect-src). Any fetch/403 failure silently falls back to the poster.
//
// Not used for images, folders, or non-ready versions (parent gates that); mouse-only
// so touch devices never trigger it (accepted per spec).

import { useCallback, useRef, useState, type ReactNode, type CSSProperties, type MouseEvent } from 'react'
import { msToClock } from '@/lib/review/view-prefs'

interface Cue {
    start: number // seconds
    end: number
    url: string // sprite image url (already signed)
    x: number
    y: number
    w: number
    h: number
}

/** Parse "HH:MM:SS.mmm" | "MM:SS.mmm" → seconds. */
function parseVttTime(s: string): number {
    const parts = s.trim().split(':')
    if (parts.length === 0) return 0
    let sec = 0
    for (const p of parts) sec = sec * 60 + parseFloat(p)
    return Number.isFinite(sec) ? sec : 0
}

/** Parse a Mux storyboard WebVTT into cues (each cue → sprite region). */
function parseStoryboardVtt(text: string, baseUrl: string): Cue[] {
    const lines = text.split(/\r?\n/)
    const cues: Cue[] = []
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const arrow = line.indexOf('-->')
        if (arrow === -1) continue
        const start = parseVttTime(line.slice(0, arrow))
        const end = parseVttTime(line.slice(arrow + 3))
        // The next non-empty line is the sprite reference: <url>#xywh=x,y,w,h
        let ref = ''
        for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim()) {
                ref = lines[j].trim()
                break
            }
        }
        const hashAt = ref.indexOf('#xywh=')
        if (hashAt === -1) continue
        const rawUrl = ref.slice(0, hashAt)
        const coords = ref.slice(hashAt + 6).split(',').map((n) => parseFloat(n))
        if (coords.length < 4 || coords.some((n) => !Number.isFinite(n))) continue
        // Resolve relative sprite URLs against the VTT URL (Mux usually emits absolute).
        let url = rawUrl
        try {
            url = new URL(rawUrl, baseUrl).toString()
        } catch {
            /* keep rawUrl */
        }
        cues.push({ start, end, url, x: coords[0], y: coords[1], w: coords[2], h: coords[3] })
    }
    return cues
}

interface ActiveFrame {
    xFrac: number
    time: number
    cue: Cue
    cw: number
    ch: number
}

export function HoverScrub({
    storyboardVttUrl,
    durationMs,
    children,
}: {
    storyboardVttUrl: string
    durationMs: number | null
    /** the at-rest poster (shown when not scrubbing / on failure). */
    children: ReactNode
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const cuesRef = useRef<Cue[] | null>(null)
    const loadingRef = useRef(false)
    const failedRef = useRef(false)
    const [active, setActive] = useState<ActiveFrame | null>(null)

    const durationSec = durationMs && durationMs > 0 ? durationMs / 1000 : null

    const ensureCues = useCallback(async () => {
        if (cuesRef.current || loadingRef.current || failedRef.current) return
        loadingRef.current = true
        try {
            const res = await fetch(storyboardVttUrl, { credentials: 'omit', cache: 'force-cache' })
            if (!res.ok) throw new Error(String(res.status))
            const text = await res.text()
            const cues = parseStoryboardVtt(text, storyboardVttUrl)
            if (cues.length === 0) throw new Error('empty')
            cuesRef.current = cues
        } catch {
            failedRef.current = true // give up silently → poster stays
        } finally {
            loadingRef.current = false
        }
    }, [storyboardVttUrl])

    const onEnter = useCallback(() => {
        void ensureCues()
    }, [ensureCues])

    const onMove = useCallback(
        (e: MouseEvent<HTMLDivElement>) => {
            const cues = cuesRef.current
            const el = containerRef.current
            if (!cues || !el || !durationSec) return
            const rect = el.getBoundingClientRect()
            if (rect.width === 0) return
            const xFrac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
            const time = xFrac * durationSec // linear map (FR-B06)
            let cue = cues[cues.length - 1]
            for (const c of cues) {
                if (time >= c.start && time < c.end) {
                    cue = c
                    break
                }
            }
            setActive({ xFrac, time, cue, cw: rect.width, ch: rect.height })
        },
        [durationSec],
    )

    const onLeave = useCallback(() => setActive(null), [])

    // Cover-fit the sprite region into the card (like object-fit: cover).
    let frame: CSSProperties | null = null
    if (active) {
        const { cue, cw, ch } = active
        const scale = Math.max(cw / cue.w, ch / cue.h)
        const scaledW = cue.w * scale
        const scaledH = cue.h * scale
        frame = {
            position: 'absolute',
            top: (ch - scaledH) / 2,
            left: (cw - scaledW) / 2,
            width: cue.w,
            height: cue.h,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            backgroundImage: `url("${cue.url}")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: `-${cue.x}px -${cue.y}px`,
        }
    }

    return (
        <div
            ref={containerRef}
            className="absolute inset-0 overflow-hidden"
            onMouseEnter={onEnter}
            onMouseMove={onMove}
            onMouseLeave={onLeave}
        >
            {children}
            {active && frame && (
                <>
                    <div style={frame} aria-hidden />
                    {/* playhead line */}
                    <div
                        className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/80"
                        style={{ left: `${active.xFrac * 100}%` }}
                        aria-hidden
                    />
                    {/* timecode tooltip */}
                    <div
                        className="pointer-events-none absolute bottom-1 -translate-x-1/2 rounded bg-black/80 px-1 py-px text-[10px] font-medium tabular-nums text-white"
                        style={{ left: `${active.xFrac * 100}%` }}
                        aria-hidden
                    >
                        {msToClock(active.time * 1000) ?? '0:00'}
                    </div>
                </>
            )}
        </div>
    )
}
