// [review-fixes P5 / FR-06] Compare Version (F6). Two versions of ONE asset side-by-side
// under a single shared transport (useSyncedTransport): master state here, both players are
// pure followers. Left = side A = drift reference. The right column shows the ACTIVE side's
// comments (TEXT-only, tied to that version); clicking a comment seeks BOTH. Version selector
// per side. Entered/exited via ?cmp=<left>.<right> owned by the shell (URL = source of truth,
// so browser Back exits). NO schema/API change — reuses useHlsPlayer(compact) + useComments.
//
// DEFERRED from v1 (do NOT add here): annotation-in-compare, range comments, pixel-diff/slider,
// guest compare, mobile (<md) compare.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, X, Play, Pause, Maximize2, Gauge, Columns2 } from 'lucide-react'
import type { VersionRow } from '@/lib/review/team-actions'
import { formatClock, frameToSeekTime, type Fps } from '@/lib/review/timecode'
import { useHlsPlayer } from './useHlsPlayer'
import { useSyncedTransport } from './useSyncedTransport'
import { useComments } from './useComments'
import { CommentsPanel } from './CommentsPanel'
import { CompareSide } from './CompareSide'

const RATES = [0.5, 1, 1.5, 2]

export function CompareView({
    versions,
    left,
    right,
    currentUserId,
    isAdmin,
    assetName,
    onExit,
    onBack,
    onChangeSides,
}: {
    versions: VersionRow[]
    left: string
    right: string
    currentUserId: string
    isAdmin: boolean
    assetName: string
    /** Return to the single-player view (drops ?cmp). */
    onExit: () => void
    /** Leave the player entirely (folder / team root). */
    onBack: () => void
    /** Rewrite ?cmp when a side's version changes (shell owns the URL). */
    onChangeSides: (left: string, right: string) => void
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const refA = useRef<HTMLVideoElement>(null)
    const refB = useRef<HTMLVideoElement>(null)

    const leftVersion = useMemo(() => versions.find((v) => v.id === left) ?? null, [versions, left])
    const rightVersion = useMemo(() => versions.find((v) => v.id === right) ?? null, [versions, right])

    const fpsA: Fps | null = leftVersion?.fps ? { num: leftVersion.fps.num, den: leftVersion.fps.den } : null
    const fpsB: Fps | null = rightVersion?.fps ? { num: rightVersion.fps.num, den: rightVersion.fps.den } : null
    const enabledA = !!leftVersion && leftVersion.uploadStatus === 'ready'
    const enabledB = !!rightVersion && rightVersion.uploadStatus === 'ready'

    // Both hooks run under the shell's <PlayerEnvProvider>; compact:true caps quality to the
    // (half-width) box + shortens buffer so two streams ≈ one full-size stream (BR-06 conflict).
    const ctlA = useHlsPlayer({ videoRef: refA, versionId: enabledA ? leftVersion!.id : null, fps: fpsA, enabled: enabledA, compact: true })
    const ctlB = useHlsPlayer({ videoRef: refB, versionId: enabledB ? rightVersion!.id : null, fps: fpsB, enabled: enabledB, compact: true })
    const bothReady = ctlA.ready && ctlB.ready
    const transport = useSyncedTransport({ refA, refB, bothReady })

    // Right (current) is active by default — that's the version under review.
    const [activeSide, setActiveSide] = useState<'a' | 'b'>('b')
    const [rateOpen, setRateOpen] = useState(false)

    // Exactly one side audible = the active side (auto-mutes the other).
    useEffect(() => {
        if (refA.current) refA.current.muted = activeSide !== 'a'
        if (refB.current) refB.current.muted = activeSide !== 'b'
    }, [activeSide, ctlA.ready, ctlB.ready])

    const feedA = useComments(leftVersion?.id ?? null)
    const feedB = useComments(rightVersion?.id ?? null)
    const activeFeed = activeSide === 'a' ? feedA : feedB
    const activeVersion = activeSide === 'a' ? leftVersion : rightVersion
    const activeFps = activeSide === 'a' ? fpsA : fpsB
    const activeController = activeSide === 'a' ? ctlA : ctlB

    const maxDur = Math.max(ctlA.durationSec, ctlB.durationSec)
    // Scrubber tracks whichever side is furthest along (they're synced until the shorter ends).
    const positionSec = Math.max(ctlA.currentSec, ctlB.currentSec)

    // Seek BOTH from an active-side FRAME (comment / marker) — convert to seconds first, since
    // the two versions may run at different fps (a frame index only means one version's clock).
    const seekActiveFrame = useCallback(
        (frame: number) => {
            transport.seekBoth(activeFps ? frameToSeekTime(frame, activeFps) : frame)
        },
        [activeFps, transport],
    )

    // A side's version change → recompute the pair, focus that side, and bubble to the shell
    // (which rewrites ?cmp). left===right is prevented in the dropdown.
    const changeSide = useCallback(
        (side: 'a' | 'b', newId: string) => {
            const nl = side === 'a' ? newId : left
            const nr = side === 'b' ? newId : right
            if (nl === nr) return
            setActiveSide(side)
            onChangeSides(nl, nr)
        },
        [left, right, onChangeSides],
    )

    // The ONE keyboard owner for compare (the single-player shell handler is disabled while
    // compare is active — avoids two Space handlers fighting). Ignore keys while typing. Position
    // is read from refs so the listener attaches ONCE (positionSec changes every frame — depending
    // on it would re-bind the window listener 30-60×/sec); toggle/seekBoth are stable useCallbacks.
    const posRef = useRef(0)
    posRef.current = positionSec
    const maxRef = useRef(0)
    maxRef.current = maxDur
    const { toggle: tToggle, seekBoth: tSeekBoth } = transport
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            if (e.code === 'Space') {
                e.preventDefault()
                tToggle()
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault()
                tSeekBoth(Math.max(0, posRef.current - 5))
            } else if (e.code === 'ArrowRight') {
                e.preventDefault()
                tSeekBoth(Math.min(maxRef.current, posRef.current + 5))
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [tToggle, tSeekBoth])

    const toggleFullscreen = useCallback(() => {
        const el = containerRef.current
        if (!el) return
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
        else el.requestFullscreen().catch(() => {})
    }, [])

    // Active-side comment markers over the shared (0..maxDur) timeline.
    const markers = useMemo(() => {
        if (!activeFps || maxDur <= 0) return []
        return activeFeed.comments
            .filter((c) => c.parentId == null && c.startFrame != null)
            .map((c) => ({ id: c.id, frame: c.startFrame as number, pct: (frameToSeekTime(c.startFrame as number, activeFps) / maxDur) * 100 }))
            .filter((m) => m.pct >= 0 && m.pct <= 100)
    }, [activeFeed.comments, activeFps, maxDur])

    return (
        <div ref={containerRef} className="flex h-[100dvh] flex-col bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-zinc-950/80 px-3 backdrop-blur">
                <button onClick={onBack} className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10" aria-label="Quay lại">
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        <Columns2 className="h-4 w-4 shrink-0 text-primary-accent" />
                        <span className="truncate">{assetName}</span>
                    </h1>
                    <p className="text-xs text-white/40">
                        So sánh v{leftVersion?.versionNumber ?? '—'} ↔ v{rightVersion?.versionNumber ?? '—'}
                    </p>
                </div>
                <button
                    onClick={onExit}
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                >
                    <X className="h-4 w-4" /> <span className="hidden sm:inline">Thoát so sánh</span>
                </button>
            </header>

            {/* Body */}
            <div className="flex min-h-0 flex-1">
                {/* players + shared transport */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-px bg-white/5">
                        <CompareSide
                            versions={versions}
                            versionId={left}
                            otherVersionId={right}
                            onChangeVersion={(id) => changeSide('a', id)}
                            videoRef={refA}
                            controller={ctlA}
                            isActive={activeSide === 'a'}
                            onActivate={() => setActiveSide('a')}
                            posterUrl={leftVersion?.media?.posterUrl ?? null}
                        />
                        <CompareSide
                            versions={versions}
                            versionId={right}
                            otherVersionId={left}
                            onChangeVersion={(id) => changeSide('b', id)}
                            videoRef={refB}
                            controller={ctlB}
                            isActive={activeSide === 'b'}
                            onActivate={() => setActiveSide('b')}
                            posterUrl={rightVersion?.media?.posterUrl ?? null}
                        />
                    </div>

                    {/* transport bar */}
                    <div className="flex shrink-0 items-center gap-3 border-t border-white/5 bg-zinc-950/80 px-3 py-2">
                        <button
                            onClick={transport.toggle}
                            disabled={!bothReady}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-white hover:bg-primary disabled:opacity-40"
                            aria-label={transport.playing ? 'Tạm dừng' : 'Phát'}
                        >
                            {transport.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>

                        <span className="shrink-0 font-mono text-xs tabular-nums text-white/60">{formatClock(positionSec)}</span>

                        {/* normalized timeline (0..max(durA,durB)) with active-side comment markers */}
                        <div className="relative flex-1">
                            <input
                                type="range"
                                min={0}
                                max={maxDur || 0}
                                step={0.01}
                                value={Math.min(positionSec, maxDur || 0)}
                                onChange={(e) => transport.seekBoth(Number(e.target.value))}
                                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-primary"
                                disabled={!bothReady}
                            />
                            <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
                                {markers.map((m) => (
                                    <button
                                        key={m.id}
                                        onClick={() => seekActiveFrame(m.frame)}
                                        style={{ left: `${m.pct}%` }}
                                        className="pointer-events-auto absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-amber-400/90 hover:bg-amber-300"
                                        aria-label="Tới bình luận"
                                    />
                                ))}
                            </div>
                        </div>

                        <span className="shrink-0 font-mono text-xs tabular-nums text-white/40">{formatClock(maxDur)}</span>

                        {/* rate */}
                        <div className="relative shrink-0">
                            <button
                                onClick={() => setRateOpen((v) => !v)}
                                className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs hover:bg-white/10"
                                title="Tốc độ phát"
                            >
                                <Gauge className="h-3.5 w-3.5 text-white/50" /> {transport.rate}×
                            </button>
                            {rateOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setRateOpen(false)} />
                                    <div className="absolute bottom-10 right-0 z-40 w-20 rounded-lg border border-white/10 bg-zinc-900/95 p-1 shadow-2xl backdrop-blur">
                                        {RATES.map((r) => (
                                            <button
                                                key={r}
                                                onClick={() => {
                                                    transport.setRate(r)
                                                    setRateOpen(false)
                                                }}
                                                className={`block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-white/10 ${
                                                    r === transport.rate ? 'text-primary-accent' : 'text-white/80'
                                                }`}
                                            >
                                                {r}×
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>

                        <button
                            onClick={toggleFullscreen}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/10"
                            aria-label="Toàn màn hình"
                        >
                            <Maximize2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* active-side comments (text-only) — hidden below md (compare comments are a
                    desktop feature; mobile compare is deferred from v1) */}
                <div className="hidden w-[340px] shrink-0 flex-col border-l border-white/5 bg-zinc-950 md:flex">
                    <div className="flex h-11 shrink-0 items-center border-b border-white/5 px-3 text-sm font-semibold text-white/90">
                        Bình luận · v{activeVersion?.versionNumber ?? '—'}
                    </div>
                    <div className="min-h-0 flex-1">
                        {activeVersion && (
                            <CommentsPanel
                                // [F6] Remount on side switch so a half-typed draft can't carry over
                                // and post against the other side's version.
                                key={activeVersion.id}
                                versionId={activeVersion.id}
                                fps={activeFps}
                                mediaKind="video"
                                currentUserId={currentUserId}
                                isAdmin={isAdmin}
                                feed={activeFeed}
                                playheadFrame={activeController.frame}
                                durationMs={activeVersion.durationMs}
                                annotation={null}
                                range={null}
                                textOnly
                                onSeekToFrame={seekActiveFrame}
                                onPauseVideo={transport.pause}
                                // [F6] Blur the textarea after posting so Space toggles playback again
                                // (an empty noop would trap focus in the composer).
                                onFocusPlayer={() => (document.activeElement as HTMLElement | null)?.blur?.()}
                                onViewAnnotation={() => {}}
                                highlightId={null}
                                onJumpToVersion={(vid) => {
                                    // In a 2-version compare the "view other version" target IS the
                                    // opposite side — flip the active side instead of changing versions
                                    // (changeSide would no-op on left===right → a dead click).
                                    const opposite = activeSide === 'a' ? right : left
                                    if (vid === opposite) setActiveSide(activeSide === 'a' ? 'b' : 'a')
                                    else changeSide(activeSide, vid)
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
