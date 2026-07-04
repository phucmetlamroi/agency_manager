'use client'

// [Review module P2.2] Team asset-browser shell (UI-UX-SPEC §1, §2). Two-column
// module: an infinite-depth ASSETS folder tree (left) + breadcrumb/toolbar/content
// (right). Read + navigate is live here; the following land in their own phases and
// are intentionally shown as disabled affordances (not dead buttons hiding logic):
//   • Appearance popover + Sort controls + hover-scrub  → P2.3
//   • New Folder + canvas/folder upload + drag-drop     → P2.4
//   • Context menus + rename + move/copy + multi-select → P2.5
//   • Trash view (Recently Deleted) + restore           → P2.6
//   • In-browser player (open asset)                    → P4
//
// All data comes from the P2.1 /api/review/* routes; each re-verifies workspace
// membership server-side, so this component trusts nothing about access. Folder
// navigation updates the URL via history.pushState (no server round-trip) and the
// deep-link routes seed `initialFolderId` on hard load / refresh.

import { useCallback, useEffect, useMemo, useState, type ReactNode, type ComponentType } from 'react'
import {
    Clapperboard,
    Folder as FolderIcon,
    Film,
    Image as ImageIcon,
    ChevronRight,
    ChevronDown,
    LayoutGrid,
    List as ListIcon,
    RefreshCw,
    FolderPlus,
    UploadCloud,
    ArrowUpDown,
    Loader2,
    AlertTriangle,
    MessageSquare,
    Layers,
} from 'lucide-react'
import { formatBytes } from '@/lib/review/upload-store'
import type { FolderDto, AssetDto } from '@/lib/review/dto'

/* ── local mirrors of the P2.1 DTO shapes (no server import → no bundle leak) ── */
interface BreadcrumbItem {
    id: string
    name: string
}
interface ChildrenResult {
    folders: FolderDto[]
    assets: AssetDto[]
    summary: { folderCount: number; assetCount: number; totalBytes: string }
    nextCursor: string | null
}
interface TreeNode {
    id: string
    parentId: string | null
    name: string
    hasChildren: boolean
}
type ViewMode = 'grid' | 'list'

/* ── helpers ─────────────────────────────────────────────────────────────── */

function teamPath(workspaceId: string, folderId: string | null): string {
    return folderId
        ? `/${workspaceId}/admin/team/folder/${folderId}`
        : `/${workspaceId}/admin/team`
}

/** Parse a folder id back out of the /admin/team[/folder/:id] pathname. */
function parseFolderId(pathname: string): string | null {
    const m = pathname.match(/\/admin\/team\/folder\/([^/?#]+)/)
    return m ? decodeURIComponent(m[1]) : null
}

async function errorMessage(res: Response): Promise<string> {
    try {
        const body = (await res.json()) as { error?: { message?: string } }
        if (body?.error?.message) return body.error.message
    } catch {
        /* non-JSON error body */
    }
    return `Lỗi ${res.status}. Vui lòng thử lại.`
}

function msToClock(ms: number | null | undefined): string | null {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return null
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
    const ss = String(s).padStart(2, '0')
    return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function bytesLabel(raw: string | number): string {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n <= 0) return '0 B'
    return formatBytes(n)
}

/* ── component ───────────────────────────────────────────────────────────── */

export function TeamBrowser({
    workspaceId,
    initialFolderId,
}: {
    workspaceId: string
    initialFolderId: string | null
}) {
    const [folderId, setFolderId] = useState<string | null>(initialFolderId)
    const [data, setData] = useState<ChildrenResult | null>(null)
    const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([])
    const [currentName, setCurrentName] = useState<string>('Team')
    const [currentFolder, setCurrentFolder] = useState<FolderDto | null>(null)
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [tree, setTree] = useState<TreeNode[]>([])
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [view, setView] = useState<ViewMode>('grid')
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    /* ---- fetchers ---- */
    const fetchChildren = useCallback(
        async (fid: string | null, cursor: string | null): Promise<ChildrenResult> => {
            const base = fid
                ? `/api/review/folders/${encodeURIComponent(fid)}/children`
                : `/api/review/folders/root/children`
            const qs = new URLSearchParams()
            if (!fid) qs.set('workspaceId', workspaceId)
            if (cursor) qs.set('cursor', cursor)
            const res = await fetch(`${base}?${qs.toString()}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            })
            if (!res.ok) throw new Error(await errorMessage(res))
            return (await res.json()) as ChildrenResult
        },
        [workspaceId],
    )

    const fetchDetail = useCallback(
        async (fid: string): Promise<{ folder: FolderDto; breadcrumb: BreadcrumbItem[] }> => {
            const res = await fetch(`/api/review/folders/${encodeURIComponent(fid)}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            })
            if (!res.ok) throw new Error(await errorMessage(res))
            return (await res.json()) as { folder: FolderDto; breadcrumb: BreadcrumbItem[] }
        },
        [],
    )

    const refreshTree = useCallback(async () => {
        try {
            const res = await fetch(
                `/api/review/tree?workspaceId=${encodeURIComponent(workspaceId)}`,
                { credentials: 'same-origin', cache: 'no-store' },
            )
            if (!res.ok) return
            const body = (await res.json()) as { folders: TreeNode[] }
            setTree(body.folders)
            // open the workspace root by default so top-level folders are visible.
            setExpanded((prev) => {
                const next = new Set(prev)
                for (const n of body.folders) if (n.parentId === null) next.add(n.id)
                return next
            })
        } catch {
            /* tree is a convenience rail; the main grid is the source of truth */
        }
    }, [workspaceId])

    /* ---- navigation ---- */
    const go = useCallback(
        (fid: string | null) => {
            if (typeof window !== 'undefined') {
                window.history.pushState({ teamFolderId: fid }, '', teamPath(workspaceId, fid))
            }
            setFolderId(fid)
        },
        [workspaceId],
    )

    // Back/forward buttons: re-derive the folder from the URL (no push).
    useEffect(() => {
        const onPop = () => setFolderId(parseFolderId(window.location.pathname))
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    /* ---- load current folder on change ---- */
    useEffect(() => {
        let alive = true
        setLoading(true)
        setError(null)
        ;(async () => {
            try {
                const [children, detail] = await Promise.all([
                    fetchChildren(folderId, null),
                    folderId ? fetchDetail(folderId) : Promise.resolve(null),
                ])
                if (!alive) return
                setData(children)
                setNextCursor(children.nextCursor)
                setBreadcrumb(detail?.breadcrumb ?? [])
                setCurrentName(detail?.folder.name ?? 'Team')
                setCurrentFolder(detail?.folder ?? null)
            } catch (e) {
                if (alive) setError(e instanceof Error ? e.message : 'Không tải được nội dung.')
            } finally {
                if (alive) setLoading(false)
            }
        })()
        return () => {
            alive = false
        }
    }, [folderId, fetchChildren, fetchDetail])

    // tree once on mount.
    useEffect(() => {
        void refreshTree()
    }, [refreshTree])

    // keep the path to the current folder expanded in the tree.
    useEffect(() => {
        setExpanded((prev) => {
            const next = new Set(prev)
            for (const b of breadcrumb) next.add(b.id)
            if (folderId) next.add(folderId)
            return next
        })
    }, [breadcrumb, folderId])

    const loadMore = useCallback(async () => {
        if (!nextCursor) return
        setLoadingMore(true)
        try {
            const more = await fetchChildren(folderId, nextCursor)
            setData((prev) => (prev ? { ...prev, assets: [...prev.assets, ...more.assets] } : more))
            setNextCursor(more.nextCursor)
        } catch {
            /* leave the button; the user can retry */
        } finally {
            setLoadingMore(false)
        }
    }, [nextCursor, folderId, fetchChildren])

    const reload = useCallback(() => {
        // re-run the load effect by nudging folderId identity is unnecessary; refetch directly.
        setLoading(true)
        setError(null)
        Promise.all([
            fetchChildren(folderId, null),
            folderId ? fetchDetail(folderId) : Promise.resolve(null),
        ])
            .then(([children, detail]) => {
                setData(children)
                setNextCursor(children.nextCursor)
                setBreadcrumb(detail?.breadcrumb ?? [])
                setCurrentName(detail?.folder.name ?? 'Team')
                setCurrentFolder(detail?.folder ?? null)
            })
            .catch((e) => setError(e instanceof Error ? e.message : 'Không tải được nội dung.'))
            .finally(() => setLoading(false))
        void refreshTree()
    }, [folderId, fetchChildren, fetchDetail, refreshTree])

    /* ---- breadcrumb trail (ancestors + current, all relabelled at the root) ---- */
    const trail = useMemo<{ id: string | null; name: string }[]>(() => {
        const crumbs: { id: string | null; name: string }[] = breadcrumb.map((b) => ({
            id: b.id,
            name: b.name,
        }))
        // The root ("Team") is element 0 of the breadcrumb for nested folders; at the
        // root view the breadcrumb is empty, so synthesize the Team crumb ourselves.
        if (crumbs.length === 0) return [{ id: null, name: 'Team' }]
        // element 0's id === the ws-root; make it navigate to the canonical root URL.
        crumbs[0] = { id: null, name: 'Team' }
        return [...crumbs, { id: folderId, name: currentName }]
    }, [breadcrumb, currentName, folderId])

    const folders = data?.folders ?? []
    const assets = data?.assets ?? []
    const isEmpty = !loading && !error && folders.length === 0 && assets.length === 0

    return (
        <div
            className="flex flex-col animate-fade-in"
            style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
        >
            {/* ── module title ── */}
            <div className="mb-4 flex items-center gap-3">
                <div
                    className="flex items-center justify-center rounded-xl"
                    style={{
                        width: 40,
                        height: 40,
                        background: 'rgba(139,92,246,0.15)',
                        border: '1px solid rgba(139,92,246,0.25)',
                    }}
                >
                    <Clapperboard className="h-5 w-5" style={{ color: '#C4B5FD' }} />
                </div>
                <div>
                    <h1 className="font-extrabold tracking-tight text-white" style={{ fontSize: 20 }}>
                        Team
                    </h1>
                    <p className="mt-px text-zinc-500" style={{ fontSize: 12 }}>
                        Trình duyệt bản dựng video — khách duyệt qua link, đồng bộ trạng thái task.
                    </p>
                </div>
            </div>

            {/* ── module body (2 columns) ── */}
            <div className="flex overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60 shadow-xl shadow-black/40 backdrop-blur-xl">
                {/* left: ASSETS tree */}
                <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/5 bg-black/20 lg:flex">
                    <div className="flex items-center gap-2 px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                        <Layers size={13} className="text-violet-400/80" />
                        Assets
                    </div>
                    <div className="min-h-[420px] flex-1 overflow-y-auto px-2 pb-4">
                        <TreeSidebar
                            nodes={tree}
                            currentFolderId={folderId}
                            expanded={expanded}
                            onToggle={(id) =>
                                setExpanded((prev) => {
                                    const next = new Set(prev)
                                    if (next.has(id)) next.delete(id)
                                    else next.add(id)
                                    return next
                                })
                            }
                            onNavigate={go}
                        />
                    </div>
                </aside>

                {/* right: header + toolbar + content */}
                <section className="flex min-w-0 flex-1 flex-col">
                    {/* breadcrumb header */}
                    <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                        <nav className="flex min-w-0 items-center gap-1 text-[13px]">
                            {trail.map((c, i) => {
                                const last = i === trail.length - 1
                                return (
                                    <span key={`${c.id ?? 'root'}-${i}`} className="flex min-w-0 items-center gap-1">
                                        {i > 0 && <ChevronRight size={13} className="shrink-0 text-zinc-600" />}
                                        {last ? (
                                            <span className="truncate font-semibold text-zinc-100" title={c.name}>
                                                {c.name}
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => go(c.id)}
                                                className="max-w-[180px] truncate text-zinc-400 transition-colors hover:text-violet-300"
                                                title={c.name}
                                            >
                                                {c.name}
                                            </button>
                                        )}
                                    </span>
                                )
                            })}
                        </nav>
                        {currentFolder && (
                            <div className="hidden shrink-0 items-center gap-3 text-[11px] text-zinc-500 sm:flex">
                                <span>{data?.summary.folderCount ?? 0} thư mục</span>
                                <span>·</span>
                                <span>{data?.summary.assetCount ?? 0} video</span>
                                <span>·</span>
                                <span>{bytesLabel(data?.summary.totalBytes ?? '0')}</span>
                            </div>
                        )}
                    </div>

                    {/* toolbar */}
                    <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-2.5">
                        <div className="flex items-center gap-2">
                            <ToolbarButton icon={FolderPlus} label="Thư mục mới" disabledHint="Sắp có (P2.4)" />
                            <ToolbarButton icon={UploadCloud} label="Tải lên" disabledHint="Sắp có (P2.4)" />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <ToolbarButton icon={ArrowUpDown} label="Sắp xếp" compact disabledHint="Sắp có (P2.3)" />
                            <div className="mx-0.5 h-5 w-px bg-white/10" />
                            <IconToggle
                                active={view === 'grid'}
                                onClick={() => setView('grid')}
                                icon={LayoutGrid}
                                title="Lưới"
                            />
                            <IconToggle
                                active={view === 'list'}
                                onClick={() => setView('list')}
                                icon={ListIcon}
                                title="Danh sách"
                            />
                            <button
                                type="button"
                                onClick={reload}
                                title="Tải lại"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                    {/* content */}
                    <div className="min-h-[420px] flex-1 overflow-y-auto p-4">
                        {loading ? (
                            <LoadingState view={view} />
                        ) : error ? (
                            <ErrorState message={error} onRetry={reload} />
                        ) : isEmpty ? (
                            <EmptyState atRoot={folderId === null} />
                        ) : (
                            <>
                                {folders.length > 0 && (
                                    <Section label="Thư mục" count={folders.length}>
                                        <div
                                            className={
                                                view === 'grid'
                                                    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
                                                    : 'flex flex-col gap-1.5'
                                            }
                                        >
                                            {folders.map((f) =>
                                                view === 'grid' ? (
                                                    <FolderCardGrid key={f.id} folder={f} onOpen={() => go(f.id)} />
                                                ) : (
                                                    <FolderRow key={f.id} folder={f} onOpen={() => go(f.id)} />
                                                ),
                                            )}
                                        </div>
                                    </Section>
                                )}

                                {assets.length > 0 && (
                                    <Section label="Video" count={assets.length}>
                                        <div
                                            className={
                                                view === 'grid'
                                                    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
                                                    : 'flex flex-col gap-1.5'
                                            }
                                        >
                                            {assets.map((a) =>
                                                view === 'grid' ? (
                                                    <AssetCardGrid key={a.id} asset={a} />
                                                ) : (
                                                    <AssetRow key={a.id} asset={a} />
                                                ),
                                            )}
                                        </div>
                                    </Section>
                                )}

                                {nextCursor && (
                                    <div className="mt-4 flex justify-center">
                                        <button
                                            type="button"
                                            onClick={loadMore}
                                            disabled={loadingMore}
                                            className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:opacity-60"
                                        >
                                            {loadingMore && <Loader2 size={13} className="animate-spin" />}
                                            Tải thêm
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>
            </div>
        </div>
    )
}

/* ── ASSETS tree ─────────────────────────────────────────────────────────── */

function TreeSidebar({
    nodes,
    currentFolderId,
    expanded,
    onToggle,
    onNavigate,
}: {
    nodes: TreeNode[]
    currentFolderId: string | null
    expanded: Set<string>
    onToggle: (id: string) => void
    onNavigate: (id: string | null) => void
}) {
    const childrenOf = useMemo(() => {
        const m = new Map<string | null, TreeNode[]>()
        for (const n of nodes) {
            const list = m.get(n.parentId)
            if (list) list.push(n)
            else m.set(n.parentId, [n])
        }
        return m
    }, [nodes])

    const roots = childrenOf.get(null) ?? []
    if (roots.length === 0) {
        return (
            <p className="px-3 py-6 text-center text-[11.5px] leading-relaxed text-zinc-600">
                Chưa có thư mục nào.
                <br />
                Bản dựng tải lên từ task sẽ hiện ở đây.
            </p>
        )
    }

    const render = (node: TreeNode, depth: number): ReactNode => {
        const isRoot = node.parentId === null
        const kids = childrenOf.get(node.id) ?? []
        const isOpen = expanded.has(node.id)
        // The ws-root maps to the canonical root view (id = null).
        const targetId = isRoot ? null : node.id
        const selected = isRoot ? currentFolderId === null : currentFolderId === node.id
        return (
            <div key={node.id}>
                <div
                    className={`group flex items-center gap-1 rounded-lg pr-1.5 transition-colors ${
                        selected ? 'bg-violet-500/15 text-violet-100' : 'text-zinc-400 hover:bg-white/[0.05]'
                    }`}
                    style={{ paddingLeft: 4 + depth * 12 }}
                >
                    {node.hasChildren ? (
                        <button
                            type="button"
                            onClick={() => onToggle(node.id)}
                            className="flex h-6 w-5 items-center justify-center text-zinc-500 hover:text-zinc-200"
                            aria-label={isOpen ? 'Thu gọn' : 'Mở rộng'}
                        >
                            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                    ) : (
                        <span className="h-6 w-5" />
                    )}
                    <button
                        type="button"
                        onClick={() => onNavigate(targetId)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
                        title={isRoot ? 'Team' : node.name}
                    >
                        <FolderIcon
                            size={14}
                            className={selected ? 'shrink-0 text-violet-300' : 'shrink-0 text-zinc-500'}
                        />
                        <span className="truncate text-[12.5px]">{isRoot ? 'Team' : node.name}</span>
                    </button>
                </div>
                {isOpen && kids.length > 0 && (
                    <div>{kids.map((k) => render(k, depth + 1))}</div>
                )}
            </div>
        )
    }

    return <div className="flex flex-col gap-0.5">{roots.map((r) => render(r, 0))}</div>
}

/* ── section wrapper ─────────────────────────────────────────────────────── */

function Section({ label, count, children }: { label: string; count: number; children: ReactNode }) {
    return (
        <div className="mb-5 last:mb-0">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                {label}
                <span className="rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] font-medium text-zinc-400">
                    {count}
                </span>
            </div>
            {children}
        </div>
    )
}

/* ── folder card / row ───────────────────────────────────────────────────── */

function FolderCardGrid({ folder, onOpen }: { folder: FolderDto; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            onDoubleClick={onOpen}
            className="group flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-violet-500/30 hover:bg-white/[0.06]"
        >
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <FolderIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-100" title={folder.name}>
                        {folder.name}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-zinc-500">
                        {folder.itemCount} mục · {bytesLabel(folder.totalBytes)}
                    </div>
                </div>
            </div>
        </button>
    )
}

function FolderRow({ folder, onOpen }: { folder: FolderDto; onOpen: () => void }) {
    return (
        <button
            type="button"
            onClick={onOpen}
            onDoubleClick={onOpen}
            className="group flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left transition-colors hover:border-white/5 hover:bg-white/[0.05]"
        >
            <FolderIcon size={16} className="shrink-0 text-violet-300" />
            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100" title={folder.name}>
                {folder.name}
            </span>
            <span className="shrink-0 text-[11px] text-zinc-500">{folder.itemCount} mục</span>
            <span className="hidden shrink-0 text-[11px] tabular-nums text-zinc-500 sm:inline">
                {bytesLabel(folder.totalBytes)}
            </span>
        </button>
    )
}

/* ── asset thumbnail (poster with graceful fallback) ─────────────────────── */

function AssetThumb({ asset, className }: { asset: AssetDto; className?: string }) {
    const [failed, setFailed] = useState(false)
    const poster = asset.currentVersion?.media?.posterUrl
    const isImage = asset.mediaKind === 'image'
    if (poster && !failed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={poster}
                alt={asset.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={() => setFailed(true)}
                className={className}
            />
        )
    }
    return (
        <div className={`grid place-items-center text-zinc-600 ${className ?? ''}`}>
            {isImage ? <ImageIcon size={22} /> : <Film size={22} />}
        </div>
    )
}

/* ── asset card / row (display-only in P2.2; player = P4) ─────────────────── */

function AssetMeta({ asset }: { asset: AssetDto }) {
    const dur = msToClock(asset.currentVersion?.durationMs)
    return (
        <>
            {asset.versionCount > 1 && (
                <span className="rounded bg-white/[0.06] px-1 py-px text-[10px] text-zinc-400">
                    {asset.versionCount} phiên bản
                </span>
            )}
            {dur && <span className="tabular-nums text-zinc-500">{dur}</span>}
            {asset.commentCountTotal > 0 && (
                <span className="inline-flex items-center gap-0.5 text-zinc-500">
                    <MessageSquare size={11} />
                    {asset.commentCountTotal}
                </span>
            )}
        </>
    )
}

function AssetCardGrid({ asset }: { asset: AssetDto }) {
    return (
        <div
            className="flex flex-col overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]"
            title="Trình xem video sẽ có ở bản sau"
        >
            <div className="relative aspect-video w-full bg-black/40">
                <AssetThumb asset={asset} className="h-full w-full object-cover" />
                {asset.statusKey && (
                    <span className="absolute left-1.5 top-1.5 max-w-[80%] truncate rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-violet-200 backdrop-blur-sm">
                        {asset.statusKey}
                    </span>
                )}
            </div>
            <div className="flex flex-col gap-1 p-2.5">
                <div className="truncate text-[12.5px] font-medium text-zinc-100" title={asset.title}>
                    {asset.title}
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                    <AssetMeta asset={asset} />
                </div>
            </div>
        </div>
    )
}

function AssetRow({ asset }: { asset: AssetDto }) {
    return (
        <div
            className="flex items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-white/5 hover:bg-white/[0.04]"
            title="Trình xem video sẽ có ở bản sau"
        >
            <div className="relative h-9 w-16 shrink-0 overflow-hidden rounded-md bg-black/40">
                <AssetThumb asset={asset} className="h-full w-full object-cover" />
            </div>
            <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-100" title={asset.title}>
                {asset.title}
            </span>
            {asset.statusKey && (
                <span className="hidden shrink-0 truncate rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10.5px] text-violet-200 sm:inline">
                    {asset.statusKey}
                </span>
            )}
            <div className="flex shrink-0 items-center gap-2 text-[11px]">
                <AssetMeta asset={asset} />
            </div>
        </div>
    )
}

/* ── toolbar affordances ─────────────────────────────────────────────────── */

function ToolbarButton({
    icon: Icon,
    label,
    compact,
    disabledHint,
}: {
    icon: ComponentType<{ size?: number; className?: string }>
    label: string
    compact?: boolean
    disabledHint?: string
}) {
    // P2.2: these open flows that land in later phases — rendered disabled with a hint
    // rather than firing dead handlers, so the intended layout is visible but honest.
    return (
        <button
            type="button"
            disabled
            title={disabledHint ? `${label} — ${disabledHint}` : label}
            className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-[12.5px] font-medium text-zinc-500 opacity-70 ${
                compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'
            }`}
        >
            <Icon size={14} />
            {!compact && label}
            {compact && <span className="hidden sm:inline">{label}</span>}
        </button>
    )
}

function IconToggle({
    active,
    onClick,
    icon: Icon,
    title,
}: {
    active: boolean
    onClick: () => void
    icon: ComponentType<{ size?: number; className?: string }>
    title: string
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                active ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100'
            }`}
        >
            <Icon size={15} />
        </button>
    )
}

/* ── states ──────────────────────────────────────────────────────────────── */

function LoadingState({ view }: { view: ViewMode }) {
    const cells = Array.from({ length: view === 'grid' ? 8 : 6 })
    return (
        <div
            className={
                view === 'grid'
                    ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'
                    : 'flex flex-col gap-1.5'
            }
        >
            {cells.map((_, i) => (
                <div
                    key={i}
                    className={`animate-pulse rounded-xl border border-white/5 bg-white/[0.03] ${
                        view === 'grid' ? 'aspect-[4/3]' : 'h-12'
                    }`}
                />
            ))}
        </div>
    )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-300">
                <AlertTriangle size={22} />
            </div>
            <p className="max-w-sm text-[13px] text-zinc-400">{message}</p>
            <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3.5 py-1.5 text-[12.5px] text-zinc-200 transition-colors hover:bg-white/[0.12]"
            >
                <RefreshCw size={13} /> Thử lại
            </button>
        </div>
    )
}

function EmptyState({ atRoot }: { atRoot: boolean }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                <Clapperboard size={26} />
            </div>
            <div>
                <p className="text-[14px] font-medium text-zinc-200">
                    {atRoot ? 'Chưa có bản dựng nào' : 'Thư mục này trống'}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-[12px] leading-relaxed text-zinc-500">
                    {atRoot
                        ? 'Bản dựng video tải lên từ ô “Video review” trong task sẽ tự động xuất hiện ở đây.'
                        : 'Chưa có thư mục con hay video trong thư mục này.'}
                </p>
            </div>
        </div>
    )
}
