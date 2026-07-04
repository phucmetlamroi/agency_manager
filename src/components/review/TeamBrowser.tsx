'use client'

// [Review module P2.2 shell + P2.3 content] Team asset-browser. Two-column module:
// an infinite-depth ASSETS folder tree (left) + breadcrumb / toolbar / content (right).
// P2.3 adds: Appearance (FR-B09) + Sort (FR-B10) popovers persisted per-user to
// localStorage 'team.appearance'; refined grid cards + hover-scrub (FR-B05/FR-B06);
// a 7-column sortable list view; single-select InfoPanel with read-only Mux metadata.
//
// Still deferred (disabled affordances / later phases): New Folder + upload → P2.4;
// context menus + rename/move/copy + multi-select → P2.5; Trash view → P2.6; the
// in-browser player + image lightbox → P4 (double-click degrades to a toast, never a
// crash); the live status dropdown → P3 (the card chip is a colored placeholder).
//
// All data comes from the P2.1 /api/review/* routes (each re-verifies workspace
// membership server-side). Sort is server-backed via ?sort=&dir=. Folder navigation
// updates the URL via history.pushState; the deep-link routes seed initialFolderId.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type ComponentType } from 'react'
import { toast } from 'sonner'
import {
    Clapperboard,
    Folder as FolderIcon,
    ChevronRight,
    ChevronDown,
    RefreshCw,
    FolderPlus,
    UploadCloud,
    Loader2,
    AlertTriangle,
    Layers,
} from 'lucide-react'
import type { FolderDto, AssetDto } from '@/lib/review/dto'
import {
    type ViewPrefs,
    type SortField,
    DEFAULT_PREFS,
    loadPrefs,
    savePrefs,
    gridMinWidth,
    aspectCss,
} from '@/lib/review/view-prefs'
import { bytesLabel } from './TeamCards'
import { FolderCardGrid, AssetCardGrid, InfoPanel } from './TeamCards'
import { TeamListView } from './TeamListView'
import { AppearanceMenu, SortMenu } from './TeamToolbar'

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

/* ── helpers ─────────────────────────────────────────────────────────────── */

function teamPath(workspaceId: string, folderId: string | null): string {
    return folderId ? `/${workspaceId}/admin/team/folder/${folderId}` : `/${workspaceId}/admin/team`
}

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
    const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const sortField = prefs.sortField
    const sortDir = prefs.sortDir
    // `hydrated` gates the first children fetch until prefs are read from
    // localStorage, so a persisted non-default sort doesn't cause a default-then-
    // persisted double fetch. `refreshKey` routes manual reload through the same
    // alive-guarded load effect. `folderIdRef` lets async writes bail after a
    // folder change (stale-response guard).
    const [hydrated, setHydrated] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const folderIdRef = useRef(folderId)
    useEffect(() => {
        folderIdRef.current = folderId
    }, [folderId])

    // hydrate per-user prefs from localStorage (client-only, after mount).
    useEffect(() => {
        setPrefs(loadPrefs())
        setHydrated(true)
    }, [])

    const updatePrefs = useCallback((patch: Partial<ViewPrefs>) => {
        setPrefs((prev) => {
            const next = { ...prev, ...patch }
            savePrefs(next)
            return next
        })
    }, [])

    /* ---- fetchers ---- */
    const fetchChildren = useCallback(
        async (fid: string | null, cursor: string | null, sf: SortField, sd: string): Promise<ChildrenResult> => {
            const base = fid
                ? `/api/review/folders/${encodeURIComponent(fid)}/children`
                : `/api/review/folders/root/children`
            const qs = new URLSearchParams()
            if (!fid) qs.set('workspaceId', workspaceId)
            qs.set('sort', sf)
            qs.set('dir', sd)
            if (cursor) qs.set('cursor', cursor)
            const res = await fetch(`${base}?${qs.toString()}`, { credentials: 'same-origin', cache: 'no-store' })
            if (!res.ok) throw new Error(await errorMessage(res))
            return (await res.json()) as ChildrenResult
        },
        [workspaceId],
    )

    const fetchDetail = useCallback(async (fid: string) => {
        const res = await fetch(`/api/review/folders/${encodeURIComponent(fid)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
        })
        if (!res.ok) throw new Error(await errorMessage(res))
        return (await res.json()) as { folder: FolderDto; breadcrumb: BreadcrumbItem[] }
    }, [])

    const refreshTree = useCallback(async () => {
        try {
            const res = await fetch(`/api/review/tree?workspaceId=${encodeURIComponent(workspaceId)}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            })
            if (!res.ok) return
            const body = (await res.json()) as { folders: TreeNode[] }
            setTree(body.folders)
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

    useEffect(() => {
        const onPop = () => setFolderId(parseFolderId(window.location.pathname))
        window.addEventListener('popstate', onPop)
        return () => window.removeEventListener('popstate', onPop)
    }, [])

    /* ---- load children (on folder / sort / manual-reload change) ---- */
    useEffect(() => {
        if (!hydrated) return // wait for persisted sort so the first fetch is correct
        let alive = true
        setLoading(true)
        setError(null)
        fetchChildren(folderId, null, sortField, sortDir)
            .then((children) => {
                if (!alive) return
                setData(children)
                setNextCursor(children.nextCursor)
            })
            .catch((e) => {
                if (alive) setError(e instanceof Error ? e.message : 'Không tải được nội dung thư mục.')
            })
            .finally(() => {
                if (alive) setLoading(false)
            })
        return () => {
            alive = false
        }
    }, [hydrated, folderId, sortField, sortDir, refreshKey, fetchChildren])

    /* ---- load breadcrumb + reset selection (on folder change only) ---- */
    useEffect(() => {
        let alive = true
        setSelectedId(null)
        if (!folderId) {
            setBreadcrumb([])
            setCurrentName('Team')
            setCurrentFolder(null)
            return
        }
        fetchDetail(folderId)
            .then((detail) => {
                if (!alive) return
                setBreadcrumb(detail.breadcrumb)
                setCurrentName(detail.folder.name)
                setCurrentFolder(detail.folder)
            })
            .catch(() => {
                /* the children fetch surfaces the error; keep the breadcrumb minimal */
            })
        return () => {
            alive = false
        }
    }, [folderId, fetchDetail])

    useEffect(() => {
        void refreshTree()
    }, [refreshTree])

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
        const fid = folderId
        setLoadingMore(true)
        try {
            const more = await fetchChildren(fid, nextCursor, sortField, sortDir)
            if (folderIdRef.current !== fid) return // navigated away — drop stale page
            setData((prev) => (prev ? { ...prev, assets: [...prev.assets, ...more.assets] } : more))
            setNextCursor(more.nextCursor)
        } catch {
            /* leave the button; the user can retry */
        } finally {
            setLoadingMore(false)
        }
    }, [nextCursor, folderId, sortField, sortDir, fetchChildren])

    // manual reload routes through the alive-guarded load effect (bump refreshKey)
    // so a slow refetch can never clobber a folder the user has since navigated to.
    const reload = useCallback(() => {
        setRefreshKey((k) => k + 1)
        void refreshTree()
    }, [refreshTree])

    // list-view header click → set field, toggle dir if same field.
    const onSortColumn = useCallback(
        (field: SortField) => {
            if (field === sortField) updatePrefs({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
            else updatePrefs({ sortField: field, sortDir: 'asc' })
        },
        [sortField, sortDir, updatePrefs],
    )

    const openAsset = useCallback((asset: AssetDto) => {
        if (asset.mediaKind === 'image') toast('Trình xem ảnh sẽ có ở bản sau.')
        else toast('Trình xem video sẽ có ở bản sau.')
    }, [])

    /* ---- breadcrumb trail ---- */
    const trail = useMemo<{ id: string | null; name: string }[]>(() => {
        const crumbs: { id: string | null; name: string }[] = breadcrumb.map((b) => ({ id: b.id, name: b.name }))
        if (crumbs.length === 0) return [{ id: null, name: 'Team' }]
        crumbs[0] = { id: null, name: 'Team' } // element 0 = ws-root → canonical root URL
        return [...crumbs, { id: folderId, name: currentName }]
    }, [breadcrumb, currentName, folderId])

    const folders = data?.folders ?? []
    const assets = data?.assets ?? []
    const isEmpty = !loading && !error && folders.length === 0 && assets.length === 0
    const selectedAsset = selectedId ? assets.find((a) => a.id === selectedId) ?? null : null

    const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth(prefs.cardSize)}px, 1fr))` }

    return (
        <div
            className="flex flex-col animate-fade-in"
            style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
        >
            {/* ── module title ── */}
            <div className="mb-4 flex items-center gap-3">
                <div
                    className="flex items-center justify-center rounded-xl"
                    style={{ width: 40, height: 40, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}
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
                            <AppearanceMenu prefs={prefs} onChange={updatePrefs} />
                            <SortMenu sortField={sortField} sortDir={sortDir} onChange={updatePrefs} />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <ToolbarButton icon={FolderPlus} label="Thư mục mới" disabledHint="Sắp có (P2.4)" />
                            <ToolbarButton icon={UploadCloud} label="Tải lên" disabledHint="Sắp có (P2.4)" />
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
                            <LoadingState prefs={prefs} gridStyle={gridStyle} />
                        ) : error ? (
                            <ErrorState message={error} onRetry={reload} />
                        ) : isEmpty ? (
                            <EmptyState atRoot={folderId === null} />
                        ) : prefs.layout === 'list' ? (
                            <>
                                <TeamListView
                                    folders={folders}
                                    assets={assets}
                                    sortField={sortField}
                                    sortDir={sortDir}
                                    onSort={onSortColumn}
                                    selectedId={selectedId}
                                    onSelect={setSelectedId}
                                    onOpenFolder={go}
                                    onOpenAsset={openAsset}
                                />
                                {selectedAsset && <InfoPanel asset={selectedAsset} onClose={() => setSelectedId(null)} />}
                                <LoadMore show={!!nextCursor} loading={loadingMore} onClick={loadMore} />
                            </>
                        ) : (
                            <>
                                {folders.length > 0 && (
                                    <Section label="Thư mục" count={folders.length}>
                                        <div className="grid gap-3" style={gridStyle}>
                                            {folders.map((f) => (
                                                <FolderCardGrid
                                                    key={f.id}
                                                    folder={f}
                                                    selected={selectedId === f.id}
                                                    onSelect={() => setSelectedId(f.id)}
                                                    onOpen={() => go(f.id)}
                                                />
                                            ))}
                                        </div>
                                    </Section>
                                )}
                                {assets.length > 0 && (
                                    <Section label="Video" count={assets.length}>
                                        <div className="grid gap-3" style={gridStyle}>
                                            {assets.map((a) => (
                                                <AssetCardGrid
                                                    key={a.id}
                                                    asset={a}
                                                    aspect={prefs.aspect}
                                                    thumb={prefs.thumb}
                                                    showInfo={prefs.showInfo}
                                                    selected={selectedId === a.id}
                                                    onSelect={() => setSelectedId(a.id)}
                                                    onOpen={() => openAsset(a)}
                                                />
                                            ))}
                                        </div>
                                    </Section>
                                )}
                                {selectedAsset && <InfoPanel asset={selectedAsset} onClose={() => setSelectedId(null)} />}
                                <LoadMore show={!!nextCursor} loading={loadingMore} onClick={loadMore} />
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
                        <FolderIcon size={14} className={selected ? 'shrink-0 text-violet-300' : 'shrink-0 text-zinc-500'} />
                        <span className="truncate text-[12.5px]">{isRoot ? 'Team' : node.name}</span>
                    </button>
                </div>
                {isOpen && kids.length > 0 && <div>{kids.map((k) => render(k, depth + 1))}</div>}
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

function LoadMore({ show, loading, onClick }: { show: boolean; loading: boolean; onClick: () => void }) {
    if (!show) return null
    return (
        <div className="mt-4 flex justify-center">
            <button
                type="button"
                onClick={onClick}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-4 py-2 text-[12.5px] text-zinc-300 transition-colors hover:bg-white/[0.1] disabled:opacity-60"
            >
                {loading && <Loader2 size={13} className="animate-spin" />}
                Tải thêm
            </button>
        </div>
    )
}

/* ── toolbar affordance (disabled until its phase) ───────────────────────── */

function ToolbarButton({
    icon: Icon,
    label,
    disabledHint,
}: {
    icon: ComponentType<{ size?: number; className?: string }>
    label: string
    disabledHint?: string
}) {
    return (
        <button
            type="button"
            disabled
            title={disabledHint ? `${label} — ${disabledHint}` : label}
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-[12.5px] font-medium text-zinc-500 opacity-70"
        >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
        </button>
    )
}

/* ── states ──────────────────────────────────────────────────────────────── */

function LoadingState({ prefs, gridStyle }: { prefs: ViewPrefs; gridStyle: React.CSSProperties }) {
    if (prefs.layout === 'list') {
        return (
            <div className="flex flex-col gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg border border-white/5 bg-white/[0.03]" />
                ))}
            </div>
        )
    }
    return (
        <div className="grid gap-3" style={gridStyle}>
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="animate-pulse overflow-hidden rounded-xl border border-white/5 bg-white/[0.03]">
                    <div className="w-full bg-white/[0.04]" style={{ aspectRatio: aspectCss(prefs.aspect) }} />
                    {prefs.showInfo && <div className="h-12" />}
                </div>
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
            <p className="max-w-sm text-[13px] text-zinc-400">{message || 'Không tải được nội dung thư mục.'}</p>
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
                    {atRoot ? 'Chưa có asset nào trong workspace này' : 'Thư mục trống'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-zinc-500">
                    {atRoot
                        ? 'Upload video từ khối BÀN GIAO của task để hệ thống tự tạo thư mục theo khách hàng. Tải trực tiếp từ đây sẽ có ở bản sau.'
                        : 'Chưa có thư mục con hay video trong thư mục này.'}
                </p>
            </div>
        </div>
    )
}
