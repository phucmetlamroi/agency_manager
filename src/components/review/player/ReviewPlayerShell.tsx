// [Review module P4.2] Full-page review player shell (route team/asset/[assetId]).
// Left = video stage; right = a tabbed panel (Bình luận / Thông tin). A version
// selector switches versions WITHOUT a page reload (swaps the hls source + panel).
// The comments panel is mounted in P4.3; P4.2 ships the player + info + selector.

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Layers, Loader2, MessageSquare, Info, Clock } from 'lucide-react'
import { listAssetVersions, type AssetVersions, type VersionRow } from '@/lib/review/team-actions'
import type { Fps } from '@/lib/review/timecode'
import { useHlsPlayer } from './useHlsPlayer'
import { VideoStage } from './VideoStage'

type Tab = 'comments' | 'info'

function fmtDate(iso: string): string {
    try {
        return new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {
        return iso
    }
}
function fmtBytes(s: string): string {
    const n = Number(s)
    if (!Number.isFinite(n) || n <= 0) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let v = n
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024
        i++
    }
    return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

export function ReviewPlayerShell({
    workspaceId,
    assetId,
    initialVersionId,
}: {
    workspaceId: string
    assetId: string
    currentUserId: string
    isAdmin: boolean
    initialVersionId: string | null
    initialCommentId: string | null
}) {
    const router = useRouter()
    const [data, setData] = useState<AssetVersions | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [currentVersionId, setCurrentVersionId] = useState<string | null>(initialVersionId)
    const [tab, setTab] = useState<Tab>('comments')
    const [selectorOpen, setSelectorOpen] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    // load the stack
    useEffect(() => {
        let cancelled = false
        listAssetVersions(assetId)
            .then((res) => {
                if (cancelled) return
                setData(res)
                setCurrentVersionId((prev) => {
                    if (prev && res.versions.some((v) => v.id === prev)) return prev
                    return res.asset.currentVersionId ?? res.versions[0]?.id ?? null
                })
            })
            .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Không tải được asset.'))
        return () => {
            cancelled = true
        }
    }, [assetId])

    const asset = data?.asset ?? null
    const version: VersionRow | null = useMemo(
        () => data?.versions.find((v) => v.id === currentVersionId) ?? null,
        [data, currentVersionId],
    )
    const isVideo = asset?.mediaKind === 'video'
    const ready = version?.uploadStatus === 'ready'
    const enabled = !!isVideo && ready
    const fps: Fps | null = version?.fps ? { num: version.fps.num, den: version.fps.den } : null
    const posterUrl = version?.media?.posterUrl ?? null

    const controller = useHlsPlayer({ videoRef, versionId: enabled ? version!.id : null, fps, enabled })

    const goBack = useCallback(() => {
        const folderId = asset?.folderId
        router.push(folderId ? `/${workspaceId}/admin/team/folder/${folderId}` : `/${workspaceId}/admin/team`)
    }, [router, workspaceId, asset?.folderId])

    if (loadError) {
        return (
            <div className="grid h-[100dvh] place-items-center bg-zinc-950 text-white/70">
                <div className="text-center">
                    <p className="mb-3 text-sm">{loadError}</p>
                    <button onClick={goBack} className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
                        Quay lại Team
                    </button>
                </div>
            </div>
        )
    }
    if (!data || !asset) {
        return (
            <div className="grid h-[100dvh] place-items-center bg-zinc-950">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            </div>
        )
    }

    return (
        <div className="flex h-[100dvh] flex-col bg-zinc-950 text-zinc-100">
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/5 bg-zinc-950/80 px-3 backdrop-blur">
                <button
                    onClick={goBack}
                    className="grid h-9 w-9 place-items-center rounded-lg text-white/70 hover:bg-white/10"
                    aria-label="Quay lại"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>
                <div className="min-w-0 flex-1">
                    <h1 className="truncate text-sm font-semibold">{asset.name}</h1>
                </div>

                {/* Version selector */}
                <div className="relative">
                    <button
                        onClick={() => setSelectorOpen((v) => !v)}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                    >
                        <Layers className="h-4 w-4 text-indigo-400" />
                        <span className="font-medium">v{version?.versionNumber ?? '—'}</span>
                        {version && <span className="text-white/40">· {version.commentCount} bình luận</span>}
                        <ChevronDown className="h-4 w-4 text-white/40" />
                    </button>
                    {selectorOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setSelectorOpen(false)} />
                            <div className="absolute right-0 top-11 z-40 max-h-[70vh] w-72 overflow-auto rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur">
                                {data.versions.map((v) => (
                                    <button
                                        key={v.id}
                                        onClick={() => {
                                            setCurrentVersionId(v.id)
                                            setSelectorOpen(false)
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white/10 ${
                                            v.id === currentVersionId ? 'bg-white/5' : ''
                                        }`}
                                    >
                                        <span className="grid h-7 w-9 shrink-0 place-items-center rounded bg-indigo-500/15 text-xs font-semibold text-indigo-300">
                                            v{v.versionNumber}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-white/90">{v.originalName}</span>
                                            <span className="block text-xs text-white/40">
                                                {fmtDate(v.createdAt)} · {v.commentCount} bình luận
                                            </span>
                                        </span>
                                        {v.id === asset.currentVersionId && (
                                            <span className="shrink-0 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                                                Hiện tại
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </header>

            {/* Body */}
            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* Stage */}
                <div className="relative min-h-0 flex-1 bg-black">
                    {version && ready ? (
                        <VideoStage
                            videoRef={videoRef}
                            controller={controller}
                            fps={fps}
                            mediaKind={isVideo ? 'video' : 'image'}
                            versionId={version.id}
                            posterUrl={posterUrl}
                        />
                    ) : (
                        <div className="grid h-full place-items-center px-6 text-center text-white/60">
                            <div className="flex flex-col items-center gap-3">
                                <Clock className="h-8 w-8 text-white/40" />
                                <p className="text-sm">
                                    {version
                                        ? version.uploadStatus === 'failed'
                                            ? 'Phiên bản xử lý thất bại.'
                                            : 'Phiên bản đang được xử lý…'
                                        : 'Không có phiên bản để xem.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel */}
                <aside className="flex h-[42vh] shrink-0 flex-col border-t border-white/5 bg-zinc-950 lg:h-auto lg:w-[380px] lg:border-l lg:border-t-0">
                    <div className="flex shrink-0 items-center gap-1 border-b border-white/5 px-2">
                        <TabBtn active={tab === 'comments'} onClick={() => setTab('comments')} icon={<MessageSquare className="h-4 w-4" />}>
                            Bình luận
                        </TabBtn>
                        <TabBtn active={tab === 'info'} onClick={() => setTab('info')} icon={<Info className="h-4 w-4" />}>
                            Thông tin
                        </TabBtn>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                        {tab === 'comments' ? (
                            <div className="grid h-full place-items-center px-6 text-center text-sm text-white/40">
                                <p>Chưa có bình luận cho phiên bản này.</p>
                            </div>
                        ) : (
                            <InfoTab version={version} />
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                active ? 'border-indigo-400 text-white' : 'border-transparent text-white/50 hover:text-white/80'
            }`}
        >
            {icon}
            {children}
        </button>
    )
}

function InfoTab({ version }: { version: VersionRow | null }) {
    if (!version) return <div className="p-4 text-sm text-white/40">Không có thông tin.</div>
    const rows: [string, string][] = [
        ['Tên file', version.originalName],
        ['Phiên bản', `v${version.versionNumber}`],
        ['Người tải lên', version.uploadedBy?.name ?? '—'],
        ['Ngày', fmtDate(version.createdAt)],
        ['Dung lượng', fmtBytes(version.sizeBytes)],
        ['Kích thước', version.width && version.height ? `${version.width}×${version.height}` : '—'],
        ['FPS', version.fps ? (version.fps.num / version.fps.den).toFixed(2) : '—'],
        ['Thời lượng', version.durationMs ? `${Math.round(version.durationMs / 1000)}s` : '—'],
        ['Bình luận', String(version.commentCount)],
    ]
    return (
        <dl className="divide-y divide-white/5">
            {rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <dt className="text-xs text-white/40">{k}</dt>
                    <dd className="max-w-[60%] truncate text-right text-sm text-white/85" title={v}>
                        {v}
                    </dd>
                </div>
            ))}
        </dl>
    )
}
