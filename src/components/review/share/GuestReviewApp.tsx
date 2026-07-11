// [Review module P5.3] The PUBLIC share page app (/r/{slug}, UI-UX §6) — English,
// dark, no app chrome. Reuses the ENTIRE P4 player stack through the guest
// PlayerEnv (endpoints → /api/r/{slug}/*, no internal toggle / mention / resolve).
//
// Identity interception: any WRITE (comment, reaction, attachment, decision)
// first ensures the Name+Email modal has been completed — the api wrappers await
// `ensureIdentity()` which opens the modal and resolves once the guest submits
// (FR-F02 AC1: asked exactly once per browser).
//
// The draw-mode invariants mirror ReviewPlayerShellInner exactly (pause + park
// on the pinned frame, keyboard blocked while drawing) — same bugs, same fixes.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Download, FileVideo, Loader2, PanelRightClose, PanelRightOpen, PencilLine, X } from 'lucide-react'
import useSWR from 'swr'
import type { Fps } from '@/lib/review/timecode'
import type { AnnotationShape, CommentDto, CreateCommentInput } from '@/lib/review/comment-client'
import { guestShareApi, type GuestShareContent, type GuestVersionView } from '@/lib/review/share-client'
import { useHlsPlayer } from '../player/useHlsPlayer'
import { VideoStage } from '../player/VideoStage'
import { useComments } from '../player/useComments'
import { useAnnotation } from '../player/useAnnotation'
import { AnnotationCanvas } from '../player/AnnotationCanvas'
import { AnnotationToolbar } from '../player/AnnotationToolbar'
import { CommentsPanel } from '../player/CommentsPanel'
import { TimelineMarkers } from '../player/TimelineMarkers'
import { PendingRangeOverlay } from '../player/PendingRangeOverlay'
import { useRangeSelection, useRangePlayback } from '../player/useRangeSelection'
import { PlayerEnvProvider, type PlayerEnv } from '../player/player-env'
import { GuestNotifyControl } from './GuestNotifyControl'

type ReviewStateDto = GuestVersionView['reviewState']

const STATE_CHIP: Record<ReviewStateDto, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'bg-zinc-500/20 text-zinc-300' },
    awaiting_review: { label: 'Awaiting review', cls: 'bg-yellow-500/15 text-yellow-300' },
    changes_requested: { label: 'Changes requested', cls: 'bg-orange-500/15 text-orange-300' },
    approved: { label: 'Approved', cls: 'bg-emerald-500/15 text-emerald-300' },
}

export function GuestReviewApp({
    slug,
    initialContent,
}: {
    slug: string
    initialContent: GuestShareContent
}) {
    const api = useMemo(() => guestShareApi(slug), [slug])

    // ── content poll (5s): picks up config changes, new versions, revocation ──
    const { data: content, mutate: refreshContent } = useSWR<GuestShareContent>(
        ['guest-share', slug],
        () => api.fetchContent(),
        { refreshInterval: 5000, revalidateOnFocus: true, fallbackData: initialContent, keepPreviousData: true },
    )
    const share = content?.share ?? initialContent.share
    const items = content?.items ?? initialContent.items

    const [guestName, setGuestName] = useState<string | null>(initialContent.guest?.name ?? null)
    const [assetIndex, setAssetIndex] = useState(0)
    const safeAssetIndex = Math.min(assetIndex, Math.max(0, items.length - 1))
    const asset = items[safeAssetIndex] ?? null

    // Pinned version: guests view ONE version (the head unless showAllVersions).
    // We PIN the version the guest opened; a new upload shows a reload banner
    // instead of hot-swapping mid-review (UI-UX §6: no auto reload).
    const [versionId, setVersionId] = useState<string | null>(asset?.versions[0]?.versionId ?? null)
    useEffect(() => {
        // Asset switched (Reel) or first load → adopt its visible head version.
        setVersionId(items[safeAssetIndex]?.versions[0]?.versionId ?? null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeAssetIndex])
    // Snapshot the pinned version's data so that when showAllVersions=false and the poll
    // drops the old head (new upload became current), we KEEP showing the pinned cut +
    // the reload banner instead of silently hot-swapping the player mid-review and
    // letting an in-flight comment post to the wrong version (finding P5-R#5).
    const liveVersion = asset?.versions.find((v) => v.versionId === versionId) ?? null
    const [versionSnap, setVersionSnap] = useState<GuestVersionView | null>(liveVersion)
    useEffect(() => {
        if (liveVersion) setVersionSnap(liveVersion) // keep latest data for the pinned id
    }, [liveVersion])
    const version: GuestVersionView | null = liveVersion ?? versionSnap ?? asset?.versions[0] ?? null
    // newHead is computed against the PINNED id, not the (possibly fallen-back) resolved
    // version — so the banner shows even after the poll no longer lists the pinned id.
    const newHead =
        asset && asset.versions[0] && version && asset.versions[0].versionId !== version.versionId ? asset.versions[0] : null

    // ── identity interception ──
    const [identityOpen, setIdentityOpen] = useState(false)
    const identityWaitersRef = useRef<{ resolve: () => void; reject: (e: Error) => void }[]>([])
    const guestNameRef = useRef(guestName)
    guestNameRef.current = guestName
    const ensureIdentity = useCallback((): Promise<void> => {
        if (guestNameRef.current) return Promise.resolve()
        setIdentityOpen(true)
        return new Promise((resolve, reject) => {
            identityWaitersRef.current.push({ resolve, reject })
        })
    }, [])
    const settleIdentity = (ok: boolean) => {
        const waiters = identityWaitersRef.current
        identityWaitersRef.current = []
        for (const w of waiters) ok ? w.resolve() : w.reject(new Error('Please add your name to continue.'))
    }

    // ── guest PlayerEnv (identity-gated writes + own-comment tracking) ──
    const mineRef = useRef<Set<string>>(new Set())
    const env: PlayerEnv = useMemo(
        () => ({
            mode: 'guest',
            lang: 'en',
            api: {
                fetchPlaybackToken: api.fetchPlaybackToken,
                fetchImageUrl: (vid) => api.fetchImageViewUrl(vid),
                listComments: (vid, q) =>
                    api.listComments(vid, q, (ids) => {
                        mineRef.current = new Set([...mineRef.current, ...ids])
                    }),
                createComment: async (vid, input: CreateCommentInput) => {
                    await ensureIdentity()
                    const res = await api.createComment(vid, input)
                    mineRef.current.add(res.comment.id)
                    return res
                },
                editComment: api.editComment,
                deleteComment: api.deleteComment,
                setCommentResolved: () => Promise.reject(new Error('Not available.')), // guests never see the button
                addReaction: async (id, emoji) => {
                    await ensureIdentity()
                    return api.addReaction(id, emoji)
                },
                removeReaction: api.removeReaction,
                initiateAttachment: async (input) => {
                    await ensureIdentity()
                    return api.initiateAttachment(input)
                },
            },
            can: {
                internalToggle: false,
                mention: false,
                resolve: false,
                editComment: (c: CommentDto) => mineRef.current.has(c.id),
                deleteComment: (c: CommentDto) => mineRef.current.has(c.id),
            },
        }),
        [api, ensureIdentity],
    )

    return (
        <PlayerEnvProvider value={env}>
            <GuestStage
                key={asset?.assetId ?? 'empty'}
                slug={slug}
                api={api}
                share={share}
                asset={asset}
                version={version}
                newHead={newHead}
                itemCount={items.length}
                assetIndex={safeAssetIndex}
                onAssetIndex={setAssetIndex}
                ensureIdentity={ensureIdentity}
                onAdoptNewHead={() => {
                    if (newHead) {
                        setVersionSnap(newHead)
                        setVersionId(newHead.versionId)
                    }
                    void refreshContent()
                }}
                refreshContent={() => void refreshContent()}
                onVersionChange={(v) => {
                    setVersionSnap(v)
                    setVersionId(v.versionId)
                }}
            />
            {identityOpen && (
                <IdentityModal
                    onSubmit={async (name, email) => {
                        const res = await api.identify({ name, email })
                        setGuestName(res.guest.name)
                        setIdentityOpen(false)
                        settleIdentity(true)
                    }}
                    onClose={() => {
                        setIdentityOpen(false)
                        settleIdentity(false)
                    }}
                />
            )}
        </PlayerEnvProvider>
    )
}

// ─────────────────────────── stage + header + panel ───────────────────────────

function GuestStage({
    slug,
    api,
    share,
    asset,
    version,
    newHead,
    itemCount,
    assetIndex,
    onAssetIndex,
    ensureIdentity,
    onAdoptNewHead,
    refreshContent,
    onVersionChange,
}: {
    slug: string
    api: ReturnType<typeof guestShareApi>
    share: GuestShareContent['share']
    asset: GuestShareContent['items'][number] | null
    version: GuestVersionView | null
    newHead: GuestVersionView | null
    itemCount: number
    assetIndex: number
    onAssetIndex: (i: number) => void
    /** opens the Name+Email modal and resolves once the guest submits (rejects if closed) */
    ensureIdentity: () => Promise<void>
    onAdoptNewHead: () => void
    refreshContent: () => void
    onVersionChange?: (v: GuestVersionView) => void
}) {
    const [versionSelectorOpen, setVersionSelectorOpen] = useState(false)
    const [panelOpen, setPanelOpen] = useState(true)
    const videoRef = useRef<HTMLVideoElement>(null)
    const isVideo = asset?.mediaKind === 'video'
    const ready = version?.uploadStatus === 'ready'
    const enabled = !!isVideo && !!ready
    const fps: Fps | null = version?.fps ? { num: version.fps.num, den: version.fps.den } : null

    const controller = useHlsPlayer({ videoRef, versionId: enabled ? version!.versionId : null, fps, enabled })
    const feed = useComments(version?.versionId ?? null)

    // [FR-04] Pending timecode/range shared with the timeline; range-playback LOOPS [in,out] (frame.io).
    const range = useRangeSelection()
    const { playRange, stopRange } = useRangePlayback(controller.frame, controller.seekToFrame, controller.play)
    // Stop the loop the instant the range is cleared or collapsed to a point (✕ / composer close).
    useEffect(() => {
        if (!range.active || range.outFrame == null) stopRange()
    }, [range.active, range.outFrame, stopRange])

    // Annotation (guest can draw — public comments carry drawings too).
    const annotation = useAnnotation()
    const { reset: annoReset } = annotation
    const [viewAnno, setViewAnno] = useState<{ shapes: AnnotationShape[]; frame: number } | null>(null)
    // [annotation fix] Same as the internal shell — do NOT gate on version.width/height (null for
    // older versions / missing Mux metadata → the whole draw feature silently dies). The canvas
    // derives its box from the LIVE <video> element, so only isVideo is required here.
    const canAnnotate = !!isVideo
    const annoActiveRef = useRef(false)
    annoActiveRef.current = annotation.active

    const { toggle: ctlToggle, step: ctlStep, pause: ctlPause, seekToFrame: ctlSeek } = controller
    const onFocusPlayer = useCallback(() => {
        ;(document.activeElement as HTMLElement | null)?.blur?.()
    }, [])

    const onViewAnnotation = useCallback(
        (c: CommentDto) => {
            if (!c.annotation) return
            annoReset()
            if (c.startFrame != null) ctlSeek(c.startFrame)
            ctlPause()
            setViewAnno({ shapes: c.annotation, frame: c.startFrame ?? 0 })
            setHighlightId(c.id)
        },
        [annoReset, ctlSeek, ctlPause],
    )
    useEffect(() => {
        if (controller.isPlaying) setViewAnno(null)
    }, [controller.isPlaying])
    useEffect(() => {
        if (annotation.active) setViewAnno(null)
    }, [annotation.active])
    const annoFrame = annotation.frame
    useEffect(() => {
        if (annotation.active && controller.isPlaying) {
            ctlPause()
            if (annoFrame != null) ctlSeek(annoFrame)
        }
    }, [annotation.active, controller.isPlaying, ctlPause, ctlSeek, annoFrame])
    useEffect(() => {
        annoReset()
        setViewAnno(null)
    }, [version?.versionId, annoReset])

    // Keyboard: Space / ←→ (blocked while drawing) — same contract as internal.
    useEffect(() => {
        if (!enabled) return
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            if (annoActiveRef.current) return
            if (e.code === 'Space') {
                e.preventDefault()
                ctlToggle()
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                ctlStep(-1)
            } else if (e.key === 'ArrowRight') {
                e.preventDefault()
                ctlStep(1)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [enabled, ctlToggle, ctlStep])

    const [highlightId, setHighlightId] = useState<string | null>(null)

    // link_opened once per mount (server debounces 30 min per session anyway).
    useEffect(() => {
        void api.sendEvent('link_opened')
    }, [api])
    // asset_viewed on first play of the current version.
    const viewedRef = useRef<string | null>(null)
    useEffect(() => {
        if (controller.isPlaying && version && viewedRef.current !== version.versionId) {
            viewedRef.current = version.versionId
            void api.sendEvent('asset_viewed', version.versionId)
        }
    }, [controller.isPlaying, version, api])

    // ── decision ──
    const [decisionModal, setDecisionModal] = useState<null | 'approve' | 'request_changes'>(null)
    const [decisionBusy, setDecisionBusy] = useState(false)
    const [toast, setToast] = useState<string | null>(null)
    const showToast = (msg: string) => {
        setToast(msg)
        window.setTimeout(() => setToast(null), 4000)
    }
    const submitDecision = async (decision: 'approve' | 'request_changes', note?: string) => {
        if (!version) return
        // A decision REQUIRES guest identity (server 401s otherwise). Gate on the modal
        // the same way comments/reactions do — without this a brand-new guest who opens
        // the link and clicks Approve dead-ends in a 401 loop (finding P5-R#1, blocker).
        try {
            await ensureIdentity()
        } catch {
            return // guest closed the identity modal → abort silently, leave decision modal open
        }
        setDecisionBusy(true)
        try {
            await api.submitDecision({ versionId: version.versionId, decision, note: note || undefined })
            setDecisionModal(null)
            showToast(decision === 'approve' ? 'Approved — the team has been notified.' : 'Changes requested — the team has been notified.')
            refreshContent()
            if (note) feed.refresh()
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
            refreshContent() // stale-state 409 → self-heal
        } finally {
            setDecisionBusy(false)
        }
    }

    const canDownload = share.allowDownload && (!share.downloadOnlyWhenApproved || version?.reviewState === 'approved')
    const onDownload = async () => {
        if (!version) return
        try {
            const { url } = await api.fetchDownloadUrl(version.versionId)
            window.location.href = url
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Download failed.')
        }
    }

    const chip = version ? STATE_CHIP[version.reviewState] : null

    const annotationOverlay =
        canAnnotate && annotation.active ? (
            <>
                <AnnotationCanvas
                    editable
                    shapes={annotation.shapes}
                    tool={annotation.tool}
                    color={annotation.color}
                    size={annotation.size}
                    intrinsicWidth={version?.width ?? null}
                    intrinsicHeight={version?.height ?? null}
                    videoRef={videoRef}
                    onCommitShape={annotation.addShape}
                />
                <AnnotationToolbar ctl={annotation} />
            </>
        ) : canAnnotate && viewAnno && !controller.isPlaying ? (
            <AnnotationCanvas
                editable={false}
                shapes={viewAnno.shapes}
                tool={annotation.tool}
                color={annotation.color}
                size={annotation.size}
                intrinsicWidth={version?.width ?? null}
                intrinsicHeight={version?.height ?? null}
                videoRef={videoRef}
                onCommitShape={annotation.addShape}
            />
        ) : null

    if (!asset || !version) {
        return (
            <div className="grid h-[100dvh] place-items-center bg-zinc-950 px-6 text-center text-white/70">
                <p className="text-sm">This content is no longer available.</p>
            </div>
        )
    }

    return (
        <div className="flex h-[100dvh] flex-col bg-[#050505] text-zinc-100">
            {/* Header */}
            <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-white/[0.10] bg-[#0c0d0f] px-3 py-2">
                <div className="flex min-w-[12rem] flex-1 items-center gap-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-violet-300/20 bg-violet-400/[0.10] text-violet-200">
                        <FileVideo className="h-4 w-4" />
                    </span>
                    <span className="hidden max-w-36 truncate text-xs text-white/45 md:inline" title={share.name}>
                        {share.name}
                    </span>
                    <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-white/25 md:block" />
                    <h1 className="min-w-0 truncate text-sm font-medium text-white" title={asset.title}>
                        {asset.title}
                    </h1>
                    {asset.versions.length > 1 ? (
                        <div className="relative">
                            <button
                                onClick={() => setVersionSelectorOpen(!versionSelectorOpen)}
                                className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-white/[0.12] bg-white/[0.045] px-2 text-xs font-medium text-white transition hover:border-white/[0.22] hover:bg-white/[0.09]"
                                aria-label="Choose version"
                                aria-expanded={versionSelectorOpen}
                                title="Choose version"
                            >
                                v{version.versionNumber}
                                <ChevronDown className="h-3 w-3 opacity-60" />
                            </button>
                            {versionSelectorOpen && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setVersionSelectorOpen(false)} />
                                    <div className="absolute left-0 top-10 z-50 min-w-44 rounded-md border border-white/[0.14] bg-[#171a20] p-1.5 shadow-2xl">
                                        {asset.versions.map((v) => (
                                            <button
                                                key={v.versionId}
                                                onClick={() => {
                                                    onVersionChange?.(v)
                                                    setVersionSelectorOpen(false)
                                                }}
                                                className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/[0.08] ${
                                                    v.versionId === version.versionId ? 'font-bold text-primary-accent' : 'text-white/70'
                                                }`}
                                            >
                                                <span>Version {v.versionNumber}</span>
                                                {v.versionId === version.versionId && <Check className="h-3.5 w-3.5 text-primary-accent" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">v{version.versionNumber}</span>
                    )}
                    {chip && <span className={`hidden shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium sm:inline ${chip.cls}`}>{chip.label}</span>}
                </div>

                <div className="ml-auto flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto">
                    {/* Reel navigation */}
                    {itemCount > 1 && (
                        <div className="hidden items-center overflow-hidden rounded-md border border-white/[0.12] bg-white/[0.035] text-xs text-white/60 md:flex">
                            <button
                                onClick={() => onAssetIndex(Math.max(0, assetIndex - 1))}
                                disabled={assetIndex === 0}
                                className="grid h-8 w-8 place-items-center hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-white/20"
                                aria-label="Previous video"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <span className="min-w-12 border-x border-white/[0.10] px-2 text-center text-[11px] font-medium tabular-nums text-white/65">
                                {assetIndex + 1} / {itemCount}
                            </span>
                            <button
                                onClick={() => onAssetIndex(Math.min(itemCount - 1, assetIndex + 1))}
                                disabled={assetIndex >= itemCount - 1}
                                className="grid h-8 w-8 place-items-center hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:text-white/20"
                                aria-label="Next video"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    )}

                    {/* [P4/FR-11] Guest email-updates opt-in (double-opt-in PIN). */}
                    {asset && <GuestNotifyControl compact slug={slug} assetId={asset.assetId} />}

                    {share.allowDownload && (
                        <button
                            onClick={onDownload}
                            disabled={!canDownload}
                            title={canDownload ? 'Download the original file' : 'Download unlocks after approval.'}
                            aria-label={canDownload ? 'Download the original file' : 'Download unlocks after approval'}
                            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white disabled:cursor-not-allowed disabled:text-white/25"
                        >
                            <Download className="h-4 w-4" /> <span className="hidden xl:inline">Download</span>
                        </button>
                    )}

                    {/* Decision buttons — always visible (FR-F03) */}
                    <button
                        onClick={() => setDecisionModal('request_changes')}
                        className="flex h-8 items-center gap-1.5 rounded-md border border-orange-400/30 bg-orange-500/10 px-2 text-xs font-medium text-orange-300 transition hover:bg-orange-500/20"
                        aria-label="Request changes"
                        title="Request changes"
                    >
                        <PencilLine className="h-4 w-4" /> <span className="hidden xl:inline">Request changes</span>
                    </button>
                    <button
                        onClick={() => setDecisionModal('approve')}
                        className="flex h-8 items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 text-xs font-semibold text-white shadow-[0_5px_14px_rgba(16,185,129,0.22)] transition hover:bg-emerald-400"
                        aria-label="Approve"
                        title="Approve"
                    >
                        <Check className="h-4 w-4" /> <span className="hidden sm:inline">Approve</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setPanelOpen((open) => !open)}
                        className={
                            panelOpen
                                ? 'grid h-8 w-8 place-items-center rounded-md bg-white/[0.08] text-white transition hover:bg-white/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300'
                                : 'grid h-8 w-8 place-items-center rounded-md text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300'
                        }
                        aria-label={panelOpen ? 'Hide comments panel' : 'Show comments panel'}
                        title={panelOpen ? 'Hide comments panel' : 'Show comments panel'}
                        aria-pressed={panelOpen}
                    >
                        {panelOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </button>
                </div>
            </header>

            {/* decision state banner */}
            {version.reviewState === 'approved' && (
                <div className="shrink-0 bg-emerald-500/15 px-4 py-2 text-center text-sm text-emerald-300">
                    You approved this video.
                </div>
            )}
            {version.reviewState === 'changes_requested' && (
                <div className="shrink-0 bg-orange-500/15 px-4 py-2 text-center text-sm text-orange-300">
                    You requested changes on v{version.versionNumber}.
                </div>
            )}
            {/* new version available */}
            {newHead && (
                <div className="flex shrink-0 items-center justify-center gap-3 bg-violet-500/15 px-4 py-2 text-sm text-violet-200">
                    A new version is available.
                    <button onClick={onAdoptNewHead} className="rounded-md bg-violet-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-400">
                        Reload
                    </button>
                </div>
            )}

            {/* Body */}
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                <div className="relative min-h-0 flex-1 bg-[#050505]">
                    {ready ? (
                        <VideoStage
                            videoRef={videoRef}
                            controller={controller}
                            fps={fps}
                            mediaKind={isVideo ? 'video' : 'image'}
                            versionId={version.versionId}
                            posterUrl={version.media?.posterUrl ?? null}
                            overlay={annotationOverlay}
                            clickToggleDisabled={annotation.active}
                            timelineChildren={
                                <>
                                    <TimelineMarkers
                                        comments={feed.comments}
                                        fps={fps}
                                        durationSec={controller.durationSec}
                                        onSeek={ctlSeek}
                                        onHighlight={setHighlightId}
                                    />
                                    <PendingRangeOverlay
                                        range={range}
                                        fps={fps}
                                        durationSec={controller.durationSec}
                                        playheadFrame={controller.frame}
                                        onPlayRange={playRange}
                                        onScrubFrame={controller.seekToFrame}
                                    />
                                </>
                            }
                        />
                    ) : (
                        <div className="grid h-full place-items-center px-6 text-center text-white/60">
                            <div className="flex flex-col items-center gap-3">
                                <Clock className="h-8 w-8 text-white/40" />
                                <p className="text-sm">This video is still processing — check back in a few minutes.</p>
                            </div>
                        </div>
                    )}
                </div>

                {panelOpen && (
                    <aside className="flex h-[42vh] shrink-0 flex-col border-t border-white/[0.10] bg-[#111318] lg:h-auto lg:w-[380px] lg:border-l lg:border-t-0">
                        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.10] px-4 text-sm font-medium text-white/85">
                            <span>Comments</span>
                            <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[11px] tabular-nums text-white/55">{feed.total}</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {share.allowComments || feed.comments.length > 0 ? (
                                <CommentsPanel
                                    // key by version so a Reload-driven version switch resets the
                                    // composer draft/frozen-frame — never carries onto another version.
                                    key={version.versionId}
                                    versionId={version.versionId}
                                    fps={fps}
                                    mediaKind={isVideo ? 'video' : 'image'}
                                    currentUserId=""
                                    isAdmin={false}
                                    feed={feed}
                                    playheadFrame={controller.frame}
                                    durationMs={version.durationMs}
                                    annotation={canAnnotate && share.allowComments ? annotation : null}
                                    range={range}
                                    onSeekToFrame={ctlSeek}
                                    onPauseVideo={ctlPause}
                                    onFocusPlayer={onFocusPlayer}
                                    onViewAnnotation={onViewAnnotation}
                                    highlightId={highlightId}
                                    onJumpToVersion={() => {}}
                                    // comments off → read-only: old public comments stay visible,
                                    // but no composer/reply that would only 403 after identity capture.
                                    readOnly={!share.allowComments}
                                />
                            ) : (
                                <div className="grid h-full place-items-center px-6 text-center text-sm text-white/40">
                                    Comments are turned off for this link.
                                </div>
                            )}
                        </div>
                        {!share.allowComments && feed.comments.length > 0 && (
                            <div className="shrink-0 border-t border-white/5 px-4 py-2.5 text-center text-xs text-white/40">
                                Comments are turned off for this link.
                            </div>
                        )}
                    </aside>
                )}
            </div>

            <footer className="shrink-0 border-t border-white/5 py-1.5 text-center text-[11px] text-white/30">
                Sent via HustlyTasker
            </footer>

            {/* toast */}
            {toast && (
                <div className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-lg bg-zinc-800 px-4 py-2 text-sm text-white shadow-xl">
                    {toast}
                </div>
            )}

            {/* decision modals */}
            {decisionModal === 'approve' && (
                <Modal onClose={() => !decisionBusy && setDecisionModal(null)}>
                    <h2 className="text-base font-semibold text-white">Approve this video?</h2>
                    <p className="mt-1.5 text-sm text-white/60">The team will be notified that you approved v{version.versionNumber}.</p>
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            onClick={() => setDecisionModal(null)}
                            disabled={decisionBusy}
                            className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => void submitDecision('approve')}
                            disabled={decisionBusy}
                            className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:opacity-60"
                        >
                            {decisionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Approve
                        </button>
                    </div>
                </Modal>
            )}
            {decisionModal === 'request_changes' && (
                <RequestChangesModal
                    busy={decisionBusy}
                    hasComments={feed.comments.length > 0}
                    onCancel={() => setDecisionModal(null)}
                    onSend={(note) => void submitDecision('request_changes', note)}
                />
            )}
        </div>
    )
}

// ─────────────────────────── modals ───────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    )
}

function RequestChangesModal({
    busy,
    hasComments,
    onCancel,
    onSend,
}: {
    busy: boolean
    hasComments: boolean
    onCancel: () => void
    onSend: (note: string) => void
}) {
    const [note, setNote] = useState('')
    return (
        <Modal onClose={() => !busy && onCancel()}>
            <h2 className="text-base font-semibold text-white">Request changes</h2>
            <p className="mt-1.5 text-sm text-white/60">
                Describe what needs to change (optional).
                {!hasComments && ' Tip: timecoded comments below help the editor the most.'}
            </p>
            <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={2000}
                autoFocus
                placeholder="Summary of changes…"
                className="mt-3 w-full resize-none rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-orange-400/50 focus:outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
                <button onClick={onCancel} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10">
                    Cancel
                </button>
                <button
                    onClick={() => onSend(note.trim())}
                    disabled={busy}
                    className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
                >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send request
                </button>
            </div>
        </Modal>
    )
}

function IdentityModal({
    onSubmit,
    onClose,
}: {
    onSubmit: (name: string, email: string) => Promise<void>
    onClose: () => void
}) {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const valid = name.trim().length > 0 && /.+@.+\..+/.test(email.trim())

    const submit = async () => {
        if (!valid || busy) return
        setBusy(true)
        setError(null)
        try {
            await onSubmit(name.trim(), email.trim())
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
            setBusy(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
                <div className="flex items-start justify-between">
                    <h2 className="text-base font-semibold text-white">Add your name to comment</h2>
                    <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-white/50 hover:bg-white/10" aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="mt-3 space-y-2.5">
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name"
                        autoFocus
                        maxLength={120}
                        className="w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
                    />
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void submit()}
                        placeholder="Email"
                        type="email"
                        maxLength={254}
                        className="w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-primary/50 focus:outline-none"
                    />
                </div>
                <p className="mt-2.5 text-xs text-white/40">
                    We only use this to identify your comments and notify you of replies. No account needed.
                </p>
                {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
                <button
                    onClick={() => void submit()}
                    disabled={!valid || busy}
                    className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"
                >
                    {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Continue
                </button>
            </div>
        </div>
    )
}
