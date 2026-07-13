'use client'

// [Review module P2.2 shell + P2.3 content + P2.4 upload + P2.5 actions] Team asset
// browser. Two-column module: an infinite-depth folder tree (left) + breadcrumb /
// toolbar / content (right).
//   P2.3 — Appearance + Sort (per-user localStorage), grid cards + hover-scrub, list
//          view, single-select InfoPanel.
//   P2.4 — New Folder (optimistic tile + inline rename), '+ Mới' upload menu, image/
//          video/folder upload + OS drag-drop, live uploading/processing cards.
//   P2.5 — right-click context menus (canvas/folder/asset), multi-select (Ctrl/Shift/
//          checkbox/select-all/Esc, cap 200) + bottom selection bar, rename (inline),
//          Move/Copy tree-picker, Duplicate, Download (asset + recursive folder), Copy
//          URL, Delete (confirm → trash). Trash VIEW + restore = P2.6.
//
// Still deferred: in-browser player + image lightbox → P4 (double-click degrades to a
// toast, never a crash); live status dropdown → P3; share menu items → P5 (disabled).
//
// All data comes from the P2.1/P2.5 /api/review/* routes (each re-verifies workspace
// membership server-side). Sort is server-backed via ?sort=&dir=.

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
    type DragEvent as ReactDragEvent,
    type MouseEvent as ReactMouseEvent,
} from 'react'
import { toast } from 'sonner'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
    Clapperboard,
    Folder as FolderIcon,
    ChevronRight,
    ChevronDown,
    RefreshCw,
    Share2,
    Loader2,
    AlertTriangle,
    Layers,
    UploadCloud,
    FolderPlus,
    Trash2,
    MoreHorizontal,
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
import { useFolderUploads, useUploadItems } from '@/lib/review/use-upload-store'
import { uploadEngine } from '@/lib/review/upload-engine'
import { collectDropFiles, fromFileList, filterValid, enqueueFolderTree, UPLOAD_ACCEPT, type DroppedFile } from '@/lib/review/team-upload'
import {
    type ItemKind,
    type ItemRef,
    type MoveRef,
    apiMoveItems,
    apiCopyItems,
    apiDeleteItems,
    apiRenameFolder,
    apiRenameAsset,
    apiRestoreItems,
    apiSetAssetStatus,
    apiMergeStacks,
    downloadVersion,
    downloadZip,
    teamFolderUrl,
    teamAssetUrl,
    copyToClipboard,
} from '@/lib/review/team-actions'
import { bytesLabel, REVIEW_ITEMS_MIME, type ItemDnd } from './TeamCards'
import { REVIEW_MODULE_LABEL } from '@/lib/review/labels'
import { FolderCardGrid, AssetCardGrid, InfoPanel } from './TeamCards'
import { ManageVersionsModal } from './ManageVersionsModal'
import { ShareLinkModal, type ShareModalTarget } from './ShareLinkModal'
import { TeamListView } from './TeamListView'
import { AppearanceMenu, SortMenu } from './TeamToolbar'
import { NewMenu, NewFolderTile, UploadingCard, DropOverlay } from './TeamUpload'
import {
    TeamContextMenuRoot,
    FolderMenuContent,
    AssetMenuContent,
    CanvasMenuContent,
    type MenuTarget,
    type ItemMenuHandlers,
} from './TeamContextMenu'
import { MoveCopyDialog, type MoveCopyMode } from './MoveCopyDialog'
import { SelectionBar } from './SelectionBar'

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

const SEL_CAP = 200 // FR-B11 multi-select cap

/* ── helpers ─────────────────────────────────────────────────────────────── */

function teamPath(workspaceId: string, folderId: string | null): string {
    return folderId ? `/${workspaceId}/team/folder/${folderId}` : `/${workspaceId}/team`
}

function parseFolderId(pathname: string): string | null {
    // [L12] The route moved from /admin/team/** to /{workspaceId}/team/** in P1 (BR-02), but this
    // parser still matched the OLD /admin/team/folder/ prefix → it NEVER matched → the breadcrumb /
    // deep-link folder id was never recovered from the URL (tree↔grid↔URL drift). Match the current
    // shape built by teamPath() above, workspace-prefix-agnostic.
    const m = pathname.match(/\/team\/folder\/([^/?#]+)/)
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

function isEditableTarget(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

/* ── component ───────────────────────────────────────────────────────────── */

export function TeamBrowser({
    workspaceId,
    initialFolderId,
    currentUserId,
    isAdmin,
    chromeless = false,
    playerBase,
    sharesHref,
    trashHref,
}: {
    workspaceId: string
    initialFolderId: string | null
    currentUserId: string
    isAdmin: boolean
    // [Giao diện 2 · MC M8] Ẩn tiêu đề module nội bộ khi nhúng trong vỏ Mission Control
    // (vỏ MC tự vẽ header "Tệp"). Mặc định false → GĐ1 /team giữ nguyên byte-identical.
    chromeless?: boolean
    // [Giao diện 2 · MC M11] Prefix route mở player asset. Mặc định `/team/asset` (GĐ1
    // byte-identical); MC truyền `/[ws]/mc/asset` để mở player trong namespace Mission Control.
    playerBase?: string
    // [Giao diện 2 · MC M21/M22] Đích 2 nút toolbar "Link chia sẻ" / "Thùng rác". Mặc định
    // `/[ws]/team/shares` + `/[ws]/team/trash` (GĐ1 byte-identical); MC truyền bản /mc để ở
    // lại namespace Mission Control.
    sharesHref?: string
    trashHref?: string
}) {
    const [folderId, setFolderId] = useState<string | null>(initialFolderId)
    const [data, setData] = useState<ChildrenResult | null>(null)
    const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([])
    const [currentName, setCurrentName] = useState<string>(REVIEW_MODULE_LABEL)
    const [currentFolder, setCurrentFolder] = useState<FolderDto | null>(null)
    const [nextCursor, setNextCursor] = useState<string | null>(null)
    const [tree, setTree] = useState<TreeNode[]>([])
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [prefs, setPrefs] = useState<ViewPrefs>(DEFAULT_PREFS)
    const [loading, setLoading] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // selection + rename + menus (P2.5)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [anchorId, setAnchorId] = useState<string | null>(null)
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null)
    const [shareTarget, setShareTarget] = useState<ShareModalTarget | null>(null) // P5.5
    const [moveCopy, setMoveCopy] = useState<{ mode: MoveCopyMode; items: ItemRef[] } | null>(null)
    const [confirmState, setConfirmState] = useState<{ items: ItemRef[]; message: string } | null>(null)

    // P3.4/P3.6 — Manage Versions modal + asset→asset merge confirm + drag state.
    const [manageVersionsId, setManageVersionsId] = useState<string | null>(null)
    const [mergeConfirm, setMergeConfirm] = useState<{ sourceId: string; targetId: string; sourceName: string; targetName: string } | null>(null)
    const [draggingIds, setDraggingIds] = useState<Set<string>>(new Set())
    const [assetFileHover, setAssetFileHover] = useState<string | null>(null)

    const sortField = prefs.sortField
    const sortDir = prefs.sortDir
    const [hydrated, setHydrated] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)
    const folderIdRef = useRef(folderId)
    useEffect(() => {
        folderIdRef.current = folderId
    }, [folderId])
    // ids removed locally (delete / move-out) — a concurrent upload silentRefresh(MERGE)
    // must NOT resurrect them from the stale accumulated list. Cleared by the authoritative
    // silentReplace once the server-fresh page confirms they're gone.
    const removedRef = useRef<Set<string>>(new Set())
    // ids whose card status is mid-write (optimistic value shown). A concurrent
    // silentRefresh/silentReplace must NOT overwrite the optimistic chip with the stale
    // server status — it re-applies the pending value until doSetStatus finalizes (same
    // spirit as removedRef for deleted rows). Maps assetId → optimistic statusKey.
    const pendingStatusRef = useRef<Map<string, string | null>>(new Map())

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

    // Re-apply any in-flight optimistic status onto a fresh server asset list (guards the
    // status chip against a concurrent silentRefresh/silentReplace reverting it).
    const applyPendingStatus = useCallback((assets: AssetDto[]): AssetDto[] => {
        const p = pendingStatusRef.current
        if (p.size === 0) return assets
        return assets.map((a) => (p.has(a.id) ? { ...a, statusKey: p.get(a.id) as string | null } : a))
    }, [])
    const withPendingStatus = useCallback(
        (res: ChildrenResult): ChildrenResult => ({ ...res, assets: applyPendingStatus(res.assets) }),
        [applyPendingStatus],
    )

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
        if (!hydrated) return
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

    /* ---- load breadcrumb + reset transient UI (on folder change only) ---- */
    useEffect(() => {
        let alive = true
        setSelectedIds(new Set())
        setAnchorId(null)
        setRenamingId(null)
        setMenuTarget(null)
        if (!folderId) {
            setBreadcrumb([])
            setCurrentName(REVIEW_MODULE_LABEL)
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
            if (folderIdRef.current !== fid) return
            setData((prev) => (prev ? { ...prev, assets: [...prev.assets, ...more.assets] } : more))
            setNextCursor(more.nextCursor)
        } catch {
            /* leave the button; the user can retry */
        } finally {
            setLoadingMore(false)
        }
    }, [nextCursor, folderId, sortField, sortDir, fetchChildren])

    const reload = useCallback(() => {
        setRefreshKey((k) => k + 1)
        void refreshTree()
    }, [refreshTree])

    // silent MERGE refetch — for uploads (keeps loaded-more pages, upserts page 1).
    const silentRefresh = useCallback(() => {
        const fid = folderId
        fetchChildren(fid, null, sortField, sortDir)
            .then((fresh) => {
                if (folderIdRef.current !== fid) return
                setData((prev) => {
                    if (!prev) return withPendingStatus(fresh)
                    const freshIds = new Set(fresh.assets.map((a) => a.id))
                    return {
                        folders: fresh.folders,
                        assets: [
                            ...applyPendingStatus(fresh.assets),
                            ...prev.assets.filter((a) => !freshIds.has(a.id) && !removedRef.current.has(a.id)),
                        ],
                        summary: fresh.summary,
                        nextCursor: prev.nextCursor,
                    }
                })
            })
            .catch(() => {})
    }, [folderId, sortField, sortDir, fetchChildren, applyPendingStatus, withPendingStatus])

    // silent REPLACE refetch — for move/copy/delete/rename (items removed/relocated, so a
    // merge would keep stale rows). Resets to page 1 (acceptable after a bulk op).
    const silentReplace = useCallback(() => {
        const fid = folderId
        fetchChildren(fid, null, sortField, sortDir)
            .then((fresh) => {
                if (folderIdRef.current !== fid) return
                setData(withPendingStatus(fresh))
                setNextCursor(fresh.nextCursor)
                removedRef.current = new Set() // fresh page is authoritative — stop suppressing
            })
            .catch(() => {})
    }, [folderId, sortField, sortDir, fetchChildren])

    const onSortColumn = useCallback(
        (field: SortField) => {
            if (field === sortField) updatePrefs({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' })
            else updatePrefs({ sortField: field, sortDir: 'asc' })
        },
        [sortField, sortDir, updatePrefs],
    )

    // Open the full-page review player (P4). Handles both video and image assets.
    const openAsset = useCallback(
        (asset: AssetDto) => {
            if (typeof window !== 'undefined') {
                const base = playerBase ?? `/${workspaceId}/team/asset`
                window.location.assign(`${base}/${asset.id}`)
            }
        },
        [workspaceId, playerBase],
    )

    /* ---- P2.4: upload + new folder ---- */
    const filesInputRef = useRef<HTMLInputElement>(null)
    const folderInputRef = useRef<HTMLInputElement>(null)
    const [newFolderEditing, setNewFolderEditing] = useState(false)
    const [pendingFolderName, setPendingFolderName] = useState<string | null>(null)
    const [newFolderOrigin, setNewFolderOrigin] = useState<string | null>(null)
    const [dragOver, setDragOver] = useState(false)
    const dragDepth = useRef(0)

    const ingest = useCallback(
        async (dropped: DroppedFile[]) => {
            const { valid, skipped } = filterValid(dropped)
            if (skipped > 0) toast(`Đã bỏ qua ${skipped} file không phải ảnh/video`)
            if (valid.length === 0) return
            try {
                await enqueueFolderTree(valid, workspaceId, folderIdRef.current)
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Tải lên thất bại.')
                return
            }
            void refreshTree()
        },
        [workspaceId, refreshTree],
    )

    const onFilesPicked = (input: HTMLInputElement) => {
        const list = input.files
        if (list && list.length) void ingest(fromFileList(list))
        input.value = ''
    }

    const startNewFolder = useCallback(() => {
        setSelectedIds(new Set())
        setNewFolderOrigin(folderIdRef.current)
        setNewFolderEditing(true)
    }, [])

    const commitNewFolder = useCallback(
        async (name: string) => {
            const parentId = newFolderOrigin
            setNewFolderEditing(false)
            setPendingFolderName(name)
            const tid = toast.loading('Đang tạo thư mục…')
            try {
                const res = await fetch('/api/review/folders', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workspaceId, parentId, name }),
                })
                if (!res.ok) throw new Error(await errorMessage(res))
                toast.success('Đã tạo thư mục thành công.', { id: tid })
                setPendingFolderName(null)
                silentRefresh()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Không tạo được thư mục.', { id: tid })
                setPendingFolderName(null)
            }
        },
        [workspaceId, refreshTree, silentRefresh, newFolderOrigin],
    )

    /* ---- live uploads (placeholder cards) ---- */
    const folderUploads = useFolderUploads(folderId)
    const liveItems = useMemo(
        () => folderUploads.filter((it) => it.status !== 'done' && it.status !== 'canceled'),
        [folderUploads],
    )

    const folders = data?.folders ?? []
    const assets = data?.assets ?? []

    const liveAssetIds = useMemo(() => {
        const ready = new Set(
            assets.filter((a) => a.currentVersion?.uploadStatus === 'ready').map((a) => a.id),
        )
        return new Set(liveItems.map((it) => it.assetId).filter((x): x is string => !!x && !ready.has(x)))
    }, [liveItems, assets])

    const liveSig = folderUploads.map((it) => `${it.id}:${it.status}`).join('|')
    const silentRef = useRef(silentRefresh)
    useEffect(() => {
        silentRef.current = silentRefresh
    }, [silentRefresh])
    useEffect(() => {
        if (liveSig) silentRef.current()
    }, [liveSig])

    // P3.6 — assets with an in-flight new-version upload (target.kind === 'asset') → block
    // merge/version drops + show a tooltip. Also drives a grid refresh when they change,
    // since asset-targeted uploads are NOT folder live-cards (liveSig above won't catch them).
    const allUploads = useUploadItems()
    const busyAssetIds = useMemo(() => {
        const s = new Set<string>()
        for (const it of allUploads) {
            // [B10 defect 1] Only a GENUINELY in-flight upload blocks the card. The old
            // `status !== 'done' && !== 'canceled'` also counted failed / interrupted /
            // paused rows, so a failed drop (or a reload that orphaned the File handle) left
            // the card busy forever — the "kéo-thả lần 2 không nhận file" report. A stuck
            // row can now be retried/removed and the next drop is accepted.
            if (
                it.target.kind === 'asset' &&
                (it.status === 'queued' ||
                    it.status === 'uploading' ||
                    it.status === 'completing' ||
                    it.status === 'processing')
            ) {
                s.add(it.target.assetId)
            }
        }
        for (const id of liveAssetIds) s.add(id)
        return s
    }, [allUploads, liveAssetIds])
    const assetUploadSig = allUploads
        .filter((it) => it.target.kind === 'asset')
        .map((it) => `${it.id}:${it.status}`)
        .join('|')
    useEffect(() => {
        if (assetUploadSig) silentRef.current()
    }, [assetUploadSig])

    // [L13] The Mux poster is minted async on READY (applyMuxReady). The upload-store signatures
    // above stop changing once the local upload settles/abandons, and a viewer who did NOT perform
    // the upload has no store item at all — so a PROCESSING card never refreshes in place and its
    // thumbnail stays black until re-navigation ("thumbnail đen, chỉ hiện sau khi đóng/mở lại").
    // Poll the children list while ANY fetched asset is still in the server pipeline; self-terminates
    // when nothing is processing (same proven pattern as TaskReviewUploadSection.tsx).
    const anyProcessing = assets.some(
        (a) => a.currentVersion && ['uploading', 'uploaded', 'processing'].includes(a.currentVersion.uploadStatus),
    )
    useEffect(() => {
        if (!anyProcessing) return
        // Bounded: normally clears the moment nothing is processing. The cap stops a runaway poll if
        // an asset is genuinely stuck (Mux never READY) OR sits on a deeper "load more" page that
        // silentRefresh (page 1 only) can't heal — after ~3 min the user can re-navigate to refresh.
        let n = 0
        const t = setInterval(() => {
            silentRef.current()
            if (++n >= 45) clearInterval(t)
        }, 4000)
        return () => clearInterval(t)
    }, [anyProcessing])

    /* ---- lookups + selection helpers ---- */
    const visibleAssets = useMemo(() => assets.filter((a) => !liveAssetIds.has(a.id)), [assets, liveAssetIds])
    const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders])
    const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets])
    const folderIdSet = useMemo(() => new Set(folders.map((f) => f.id)), [folders])
    const typeOf = useCallback((id: string): ItemKind => (folderIdSet.has(id) ? 'folder' : 'asset'), [folderIdSet])
    // render order: folders first, then visible assets (matches both grid + list).
    const orderedIds = useMemo(
        () => [...folders.map((f) => f.id), ...visibleAssets.map((a) => a.id)],
        [folders, visibleAssets],
    )

    const capSet = useCallback((s: Set<string>): Set<string> => {
        if (s.size <= SEL_CAP) return s
        toast(`Chỉ chọn được tối đa ${SEL_CAP} mục.`)
        return new Set([...s].slice(0, SEL_CAP))
    }, [])

    const clearSelection = useCallback(() => {
        setSelectedIds(new Set())
        setAnchorId(null)
    }, [])

    const onItemClick = useCallback(
        (id: string, e: ReactMouseEvent) => {
            if (renamingId) return
            const additive = e.ctrlKey || e.metaKey
            const range = e.shiftKey
            if (range && anchorId) {
                const a = orderedIds.indexOf(anchorId)
                const b = orderedIds.indexOf(id)
                if (a >= 0 && b >= 0) {
                    const [lo, hi] = a < b ? [a, b] : [b, a]
                    const next = new Set(selectedIds)
                    for (const rid of orderedIds.slice(lo, hi + 1)) next.add(rid)
                    setSelectedIds(capSet(next))
                    return
                }
            }
            if (additive) {
                const next = new Set(selectedIds)
                if (next.has(id)) next.delete(id)
                else next.add(id)
                setSelectedIds(capSet(next))
                setAnchorId(id)
                return
            }
            setSelectedIds(new Set([id]))
            setAnchorId(id)
        },
        [renamingId, anchorId, orderedIds, selectedIds, capSet],
    )

    const onToggleSelect = useCallback(
        (id: string) => {
            const next = new Set(selectedIds)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            setSelectedIds(capSet(next))
            setAnchorId(id)
        },
        [selectedIds, capSet],
    )

    const allVisibleSelected = orderedIds.length > 0 && orderedIds.every((id) => selectedIds.has(id))
    const anyVisibleSelected = orderedIds.some((id) => selectedIds.has(id))
    const onSelectAllVisible = useCallback(() => {
        // Toggle: if ANY visible item is selected → clear. This works even when the 200-item
        // cap prevented a full "select all" (allVisibleSelected would stay false forever),
        // so the header checkbox can always deselect.
        if (anyVisibleSelected) clearSelection()
        else setSelectedIds(capSet(new Set(orderedIds)))
    }, [anyVisibleSelected, orderedIds, capSet, clearSelection])

    const toItemRefs = useCallback(
        (ids: string[]): ItemRef[] => ids.map((id) => ({ type: typeOf(id), id })),
        [typeOf],
    )
    const toMoveRefs = useCallback(
        (items: ItemRef[]): MoveRef[] =>
            items.map((i) => ({
                ...i,
                rowVersion: (i.type === 'folder' ? folderById.get(i.id)?.rowVersion : assetById.get(i.id)?.rowVersion) ?? 0,
            })),
        [folderById, assetById],
    )
    const canDeleteItems = useCallback(
        (items: ItemRef[]): boolean =>
            items.every((i) => i.type === 'asset' || isAdmin || folderById.get(i.id)?.createdBy?.id === currentUserId),
        [isAdmin, folderById, currentUserId],
    )

    /* ---- actions ---- */
    const doDownload = useCallback(
        async (items: ItemRef[]) => {
            if (items.length === 0) return
            const folderItems = items.filter((i) => i.type === 'folder')
            const assetItems = items.filter((i) => i.type === 'asset')
            // Assets that actually have a READY current version to download.
            const readyAssets = assetItems
                .map((it) => assetById.get(it.id))
                .filter((a): a is NonNullable<typeof a> => !!a && a.currentVersion?.uploadStatus === 'ready' && !!a.currentVersionId)
            const notReady = assetItems.length - readyAssets.length

            // Download rule (owner): a folder → the WHOLE folder as ONE .zip. Assets only → 3+ videos
            // bundle into a .zip; 1–2 download as separate individual files. (A single video → direct.)
            const useZip = folderItems.length > 0 || readyAssets.length >= 3
            const tid = toast.loading('Đang chuẩn bị tải xuống…')
            try {
                if (useZip) {
                    const folders = folderItems.map((i) => i.id)
                    const assets = readyAssets.map((a) => a.id)
                    if (folders.length === 0 && assets.length === 0) {
                        toast.error('Không có tệp nào sẵn sàng để tải.', { id: tid })
                        return
                    }
                    downloadZip({ folders, assets }) // one streamed .zip via the browser download
                    toast.success(`Đang tải xuống dạng .zip${notReady ? ` (bỏ qua ${notReady} chưa xử lý xong)` : ''}.`, { id: tid })
                } else {
                    if (readyAssets.length === 0) {
                        toast.error('Không có tệp nào sẵn sàng để tải.', { id: tid })
                        return
                    }
                    let count = 0
                    for (const a of readyAssets) {
                        await downloadVersion(a.currentVersionId!)
                        count += 1
                        // stagger the (at most 2) downloads so the browser doesn't drop the second one.
                        if (count < readyAssets.length) await new Promise((r) => setTimeout(r, 400))
                    }
                    toast.success(`Đã bắt đầu tải ${count} tệp${notReady ? ` (bỏ qua ${notReady} chưa xử lý xong)` : ''}.`, { id: tid })
                }
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Tải xuống thất bại.', { id: tid })
            }
        },
        [assetById],
    )

    const doCopyUrl = useCallback(
        async (target: MenuTarget) => {
            const url = target.type === 'folder' ? teamFolderUrl(workspaceId, target.id) : (() => {
                const a = assetById.get(target.id)
                return a ? teamAssetUrl(workspaceId, a) : teamFolderUrl(workspaceId, target.id)
            })()
            const ok = await copyToClipboard(url)
            toast(ok ? 'Đã sao chép link vào clipboard.' : 'Không sao chép được. Hãy sao chép thủ công.')
        },
        [workspaceId, assetById],
    )

    const openMoveCopy = useCallback((mode: MoveCopyMode, items: ItemRef[]) => {
        if (items.length === 0) return
        setMoveCopy({ mode, items })
    }, [])

    const doMoveCopyConfirm = useCallback(
        async (targetFolderId: string) => {
            if (!moveCopy) return
            const { mode, items } = moveCopy
            setMoveCopy(null)
            const tid = toast.loading(mode === 'move' ? 'Đang di chuyển…' : 'Đang sao chép…')
            try {
                if (mode === 'move') {
                    await apiMoveItems(toMoveRefs(items), targetFolderId)
                    for (const it of items) removedRef.current.add(it.id) // suppress until silentReplace confirms
                    toast.success('Đã di chuyển.', { id: tid })
                } else {
                    const r = await apiCopyItems(items, targetFolderId)
                    toast.success(
                        `Đã sao chép.${r.skippedAssets ? ` (bỏ qua ${r.skippedAssets} asset chưa xử lý xong)` : ''}`,
                        { id: tid },
                    )
                }
                clearSelection()
                silentReplace()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Thao tác thất bại.', { id: tid })
            }
        },
        [moveCopy, toMoveRefs, clearSelection, silentReplace, refreshTree],
    )

    const doDuplicate = useCallback(
        async (items: ItemRef[]) => {
            if (items.length === 0) return
            const tid = toast.loading('Đang nhân bản…')
            try {
                const r = await apiCopyItems(items, folderIdRef.current, true)
                toast.success(
                    `Đã nhân bản.${r.skippedAssets ? ` (bỏ qua ${r.skippedAssets} asset chưa xử lý xong)` : ''}`,
                    { id: tid },
                )
                clearSelection()
                silentReplace()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Nhân bản thất bại.', { id: tid })
            }
        },
        [clearSelection, silentReplace, refreshTree],
    )

    const requestDelete = useCallback(
        (items: ItemRef[]) => {
            if (items.length === 0) return
            const folderItems = items.filter((i) => i.type === 'folder')
            let message: string
            if (folderItems.length === 1 && items.length === 1) {
                const f = folderById.get(folderItems[0].id)
                const inside = f && f.itemCount > 0 ? ` và ${f.itemCount} mục bên trong` : ''
                message = `Xóa thư mục “${f?.name ?? ''}”${inside}? Có thể khôi phục trong 30 ngày.`
            } else {
                message = `Xóa ${items.length} mục đã chọn? Có thể khôi phục trong 30 ngày.`
            }
            setConfirmState({ items, message })
        },
        [folderById],
    )

    // Restore just-deleted items (5s Undo affordance on the delete toast — TRS-01).
    const undoDelete = useCallback(
        async (items: ItemRef[]) => {
            const tid = toast.loading('Đang hoàn tác…')
            try {
                await apiRestoreItems(items)
                for (const it of items) removedRef.current.delete(it.id)
                toast.success('Đã hoàn tác.', { id: tid })
                silentReplace()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Không hoàn tác được.', { id: tid })
            }
        },
        [silentReplace, refreshTree],
    )

    const doDeleteConfirmed = useCallback(async () => {
        if (!confirmState) return
        const items = confirmState.items
        setConfirmState(null)
        const tid = toast.loading('Đang xóa…')
        try {
            await apiDeleteItems(items)
            for (const it of items) removedRef.current.add(it.id) // suppress until silentReplace confirms
            toast.success('Đã chuyển vào “Đã xóa gần đây”.', {
                id: tid,
                duration: 6000,
                action: { label: 'Hoàn tác', onClick: () => void undoDelete(items) },
            })
            clearSelection()
            silentReplace()
            void refreshTree()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Xóa thất bại.', { id: tid })
        }
    }, [confirmState, clearSelection, silentReplace, refreshTree, undoDelete])

    /* ---- rename ---- */
    const startRename = useCallback((id: string) => {
        setRenamingId(id)
        setSelectedIds(new Set([id]))
        setAnchorId(id)
    }, [])

    const commitRename = useCallback(
        async (id: string, name: string) => {
            setRenamingId(null)
            const type = typeOf(id)
            try {
                if (type === 'folder') {
                    const f = folderById.get(id)
                    if (!f) return
                    await apiRenameFolder(id, name, f.rowVersion)
                } else {
                    const a = assetById.get(id)
                    if (!a) return
                    await apiRenameAsset(id, name, a.rowVersion)
                }
                silentReplace()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Đổi tên thất bại.')
            }
        },
        [typeOf, folderById, assetById, silentReplace, refreshTree],
    )

    /* ---- P3.5: set / clear an asset's card status (optimistic + optimistic-locked) ---- */
    const doSetStatus = useCallback(
        async (assetId: string, statusId: string | null) => {
            const asset = assetById.get(assetId)
            if (!asset || asset.statusKey === statusId) return
            const prevStatus = asset.statusKey
            const expected = asset.rowVersion
            // Guard the optimistic chip against a concurrent silentRefresh/silentReplace.
            pendingStatusRef.current.set(assetId, statusId)
            setData((d) =>
                d ? { ...d, assets: d.assets.map((a) => (a.id === assetId ? { ...a, statusKey: statusId } : a)) } : d,
            )
            try {
                const res = await apiSetAssetStatus(assetId, statusId, expected)
                setData((d) =>
                    d
                        ? {
                              ...d,
                              assets: d.assets.map((a) =>
                                  a.id === assetId ? { ...a, statusKey: res.statusKey, rowVersion: res.rowVersion } : a,
                              ),
                          }
                        : d,
                )
            } catch (e) {
                // Roll the chip back; a rowVersion clash means someone else changed it — resync.
                setData((d) =>
                    d ? { ...d, assets: d.assets.map((a) => (a.id === assetId ? { ...a, statusKey: prevStatus } : a)) } : d,
                )
                toast.error(e instanceof Error ? e.message : 'Không đổi được trạng thái.')
            } finally {
                pendingStatusRef.current.delete(assetId)
            }
        },
        [assetById],
    )

    /* ---- P3.6: drag-and-drop (move onto folder · merge onto asset · file → new version) ---- */
    const onItemDragStart = useCallback(
        (e: ReactDragEvent, id: string) => {
            // Drag the whole selection if the grabbed item is part of it; otherwise just this one.
            const ids = selectedIds.has(id) ? [...selectedIds] : [id]
            if (!selectedIds.has(id)) {
                setSelectedIds(new Set([id]))
                setAnchorId(id)
            }
            try {
                e.dataTransfer.setData(REVIEW_ITEMS_MIME, JSON.stringify(toItemRefs(ids)))
                e.dataTransfer.effectAllowed = 'copyMove'
            } catch {
                /* setData can throw in odd browsers — the drop handlers no-op without it */
            }
            setDraggingIds(new Set(ids))
        },
        [selectedIds, toItemRefs],
    )
    const onItemDragEnd = useCallback(() => setDraggingIds(new Set()), [])

    const doDropMove = useCallback(
        async (items: ItemRef[], targetFolderId: string) => {
            const moving = items.filter((i) => !(i.type === 'folder' && i.id === targetFolderId))
            if (moving.length === 0) return
            const tid = toast.loading('Đang di chuyển…')
            try {
                await apiMoveItems(toMoveRefs(moving), targetFolderId)
                for (const it of moving) removedRef.current.add(it.id)
                toast.success('Đã di chuyển.', { id: tid })
                clearSelection()
                silentReplace()
                void refreshTree()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Di chuyển thất bại.', { id: tid })
            }
        },
        [toMoveRefs, clearSelection, silentReplace, refreshTree],
    )

    const onDropItemsOnAsset = useCallback(
        (items: ItemRef[], targetAssetId: string) => {
            const assetsOnly = items.filter((i) => i.type === 'asset')
            if (items.length !== 1 || assetsOnly.length !== 1) {
                toast('Chỉ gộp được một asset vào một asset.')
                return
            }
            const sourceId = assetsOnly[0].id
            if (sourceId === targetAssetId) return
            const source = assetById.get(sourceId)
            const target = assetById.get(targetAssetId)
            if (!source || !target) return
            if (source.mediaKind !== target.mediaKind) {
                toast.error('Không thể gộp ảnh và video vào cùng một stack.')
                return
            }
            setMergeConfirm({ sourceId, targetId: targetAssetId, sourceName: source.title, targetName: target.title })
        },
        [assetById],
    )

    const doMergeConfirmed = useCallback(async () => {
        if (!mergeConfirm) return
        const { sourceId, targetId } = mergeConfirm
        setMergeConfirm(null)
        const tid = toast.loading('Đang gộp phiên bản…')
        try {
            const r = await apiMergeStacks(sourceId, targetId)
            removedRef.current.add(sourceId) // source asset is consumed
            toast.success(`Đã gộp ${r.mergedCount} phiên bản.`, { id: tid })
            clearSelection()
            silentReplace()
            void refreshTree()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Gộp thất bại.', { id: tid })
        }
    }, [mergeConfirm, clearSelection, silentReplace, refreshTree])

    const onDropFilesOnAsset = useCallback(
        (assetId: string, dt: DataTransfer) => {
            const asset = assetById.get(assetId)
            void collectDropFiles(dt).then((dropped) => {
                const { valid, skipped } = filterValid(dropped)
                if (valid.length === 0) {
                    toast.error('Không có file ảnh/video hợp lệ để thêm phiên bản.')
                    return
                }
                // A version is one file; if several were dropped, take the first and note the rest.
                uploadEngine.enqueue(valid[0].file, { kind: 'asset', assetId }, { targetLabel: asset?.title ?? 'Phiên bản mới' })
                const extra = valid.length - 1 + skipped
                toast.success(
                    `Đang tải phiên bản mới${asset ? ` cho “${asset.title}”` : ''}…${extra > 0 ? ` (bỏ qua ${extra} file khác)` : ''}`,
                )
            })
        },
        [assetById],
    )

    const dnd: ItemDnd = useMemo(
        () => ({
            draggingIds,
            onDragStart: onItemDragStart,
            onDragEnd: onItemDragEnd,
            onDropItemsOnFolder: doDropMove,
            onDropItemsOnAsset,
            onDropFilesOnAsset,
            onFileHoverAsset: setAssetFileHover,
            busyAssetIds,
        }),
        [draggingIds, onItemDragStart, onItemDragEnd, doDropMove, onDropItemsOnAsset, onDropFilesOnAsset, busyAssetIds],
    )

    const openManageVersions = useCallback((assetId: string) => setManageVersionsId(assetId), [])

    /* ---- context-menu target resolution ---- */
    const handleOpenTarget = useCallback(
        (t: MenuTarget | null) => {
            setMenuTarget(t)
            if (t && !selectedIds.has(t.id)) {
                setSelectedIds(new Set([t.id]))
                setAnchorId(t.id)
            }
        },
        [selectedIds],
    )

    /* ---- keyboard: Esc clear, Ctrl+A select-all, F2 rename ---- */
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (renamingId || isEditableTarget(e.target)) return
            if (e.key === 'Escape') {
                if (selectedIds.size) clearSelection()
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
                if (orderedIds.length) {
                    e.preventDefault()
                    setSelectedIds(capSet(new Set(orderedIds)))
                }
            } else if (e.key === 'F2' && selectedIds.size === 1) {
                startRename([...selectedIds][0])
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [renamingId, selectedIds, orderedIds, capSet, clearSelection, startRename])

    /* ---- ?asset= deep-link preselect (once) ---- */
    useEffect(() => {
        if (typeof window === 'undefined') return
        const a = new URLSearchParams(window.location.search).get('asset')
        if (a) {
            setSelectedIds(new Set([a]))
            setAnchorId(a)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    /* ---- drag-drop (OS files → current folder) ---- */
    const isFileDrag = (e: ReactDragEvent) => Array.from(e.dataTransfer.types).includes('Files')
    const onDragEnter = (e: ReactDragEvent) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragDepth.current += 1
        setDragOver(true)
    }
    const onDragOver = (e: ReactDragEvent) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: ReactDragEvent) => {
        if (!isFileDrag(e)) return
        dragDepth.current -= 1
        if (dragDepth.current <= 0) {
            dragDepth.current = 0
            setDragOver(false)
        }
    }
    const onDrop = (e: ReactDragEvent) => {
        if (!isFileDrag(e)) return
        e.preventDefault()
        dragDepth.current = 0
        setDragOver(false)
        void collectDropFiles(e.dataTransfer).then(ingest)
    }

    // [B10 defect 2] A drop that lands on a CARD stops propagation (so files don't ALSO
    // upload to the folder), which means the browser-level onDrop above never runs and the
    // "Thả để tải lên" overlay stays stuck — the reload-to-recover symptom. A window-level
    // drop/dragend listener always resets the overlay counter regardless of what consumed
    // the drop. It also preventDefaults file drags at the window so a near-miss doesn't make
    // the browser navigate away to open the file.
    useEffect(() => {
        const hasFiles = (dt: DataTransfer | null) => !!dt && Array.from(dt.types).includes('Files')
        const resetOverlay = () => {
            dragDepth.current = 0
            setDragOver(false)
        }
        const onWinDragOver = (e: DragEvent) => {
            if (hasFiles(e.dataTransfer)) e.preventDefault()
        }
        const onWinDrop = (e: DragEvent) => {
            if (hasFiles(e.dataTransfer)) e.preventDefault()
            resetOverlay()
        }
        window.addEventListener('dragover', onWinDragOver)
        window.addEventListener('drop', onWinDrop)
        window.addEventListener('dragend', resetOverlay)
        return () => {
            window.removeEventListener('dragover', onWinDragOver)
            window.removeEventListener('drop', onWinDrop)
            window.removeEventListener('dragend', resetOverlay)
        }
    }, [])

    /* ---- breadcrumb trail ---- */
    const trail = useMemo<{ id: string | null; name: string }[]>(() => {
        const crumbs: { id: string | null; name: string }[] = breadcrumb.map((b) => ({ id: b.id, name: b.name }))
        if (crumbs.length === 0) return [{ id: null, name: REVIEW_MODULE_LABEL }]
        crumbs[0] = { id: null, name: REVIEW_MODULE_LABEL }
        return [...crumbs, { id: folderId, name: currentName }]
    }, [breadcrumb, currentName, folderId])

    /* ---- derived render state ---- */
    const singleSelId = selectedIds.size === 1 ? [...selectedIds][0] : null
    const selectedAsset = singleSelId ? assetById.get(singleSelId) ?? null : null
    const selectedFolders = folders.filter((f) => selectedIds.has(f.id))
    const selectedAssets = assets.filter((a) => selectedIds.has(a.id))

    const tileEditing = newFolderEditing && newFolderOrigin === folderId
    const tilePending = !newFolderEditing && pendingFolderName != null && newFolderOrigin === folderId
    const showNewFolderTile = tileEditing || tilePending
    const hasContent = folders.length > 0 || visibleAssets.length > 0 || liveItems.length > 0 || showNewFolderTile
    const isEmpty = !loading && !error && !hasContent

    const gridStyle = { gridTemplateColumns: `repeat(auto-fill, minmax(${gridMinWidth(prefs.cardSize)}px, 1fr))` }

    /* ---- context-menu content ---- */
    const renderMenu = useCallback((): ReactNode => {
        if (!menuTarget) {
            return (
                <CanvasMenuContent
                    onUploadFiles={() => filesInputRef.current?.click()}
                    onUploadFolder={() => folderInputRef.current?.click()}
                    onNewFolder={startNewFolder}
                />
            )
        }
        const target = menuTarget
        const acting: ItemRef[] = selectedIds.size ? toItemRefs([...selectedIds]) : [{ type: target.type, id: target.id }]
        const soleAsset = target.type === 'asset' && acting.length === 1 && acting[0].type === 'asset'
        const h: ItemMenuHandlers = {
            onDownload: () => doDownload(acting),
            onCopyUrl: () => doCopyUrl(target),
            onCopyTo: () => openMoveCopy('copy', acting),
            onMoveTo: () => openMoveCopy('move', acting),
            onDuplicate: () => doDuplicate(acting),
            onRename: () => startRename(target.id),
            onDelete: () => requestDelete(acting),
            canDelete: canDeleteItems(acting),
            onManageVersions: soleAsset ? () => openManageVersions(target.id) : undefined,
            // P5.5 — share the acting selection (multi-select works via right-click).
            onCreateShare: () =>
                setShareTarget({
                    workspaceId,
                    items: acting.map((i) => ({
                        type: i.type,
                        id: i.id,
                        title: (i.type === 'folder' ? folderById.get(i.id)?.name : assetById.get(i.id)?.title) ?? '—',
                    })),
                }),
        }
        return target.type === 'folder' ? <FolderMenuContent {...h} /> : <AssetMenuContent {...h} />
    }, [menuTarget, selectedIds, toItemRefs, doDownload, doCopyUrl, openMoveCopy, doDuplicate, startRename, requestDelete, canDeleteItems, openManageVersions, workspaceId, folderById, assetById])

    const selectionActive = selectedIds.size > 0

    return (
        <div
            className="flex flex-col animate-fade-in"
            style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
        >
            {/* hidden upload inputs (P2.4) */}
            <input
                ref={filesInputRef}
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                className="hidden"
                onChange={(e) => onFilesPicked(e.currentTarget)}
            />
            <input
                ref={folderInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => onFilesPicked(e.currentTarget)}
                {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            />

            {/* ── module title (ẩn khi chromeless — vỏ MC M8 tự vẽ header) ── */}
            {!chromeless && (
                <div className="mb-4 flex items-center gap-3">
                    <div
                        className="flex items-center justify-center rounded-xl"
                        style={{ width: 40, height: 40, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}
                    >
                        <Clapperboard className="h-5 w-5" style={{ color: '#C4B5FD' }} />
                    </div>
                    <div>
                        <h1 className="font-extrabold tracking-tight text-white" style={{ fontSize: 20 }}>
                            {REVIEW_MODULE_LABEL}
                        </h1>
                        <p className="mt-px text-muted-foreground" style={{ fontSize: 12 }}>
                            Trình duyệt bản dựng video — khách duyệt qua link, đồng bộ trạng thái task.
                        </p>
                    </div>
                </div>
            )}

            {/* ── module body (2 columns) ── */}
            <div className="flex overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/60 shadow-xl shadow-black/40 backdrop-blur-xl">
                {/* left: ASSETS tree */}
                <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/5 bg-black/20 lg:flex">
                    <div className="flex items-center gap-2 px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
                        <BreadcrumbTrail trail={trail} onNavigate={go} />
                        {currentFolder && (
                            <div className="hidden shrink-0 items-center gap-3 text-[11px] text-muted-foreground sm:flex">
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
                            <a
                                href={sharesHref ?? `/${workspaceId}/team/shares`}
                                title="Link chia sẻ"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                                <Share2 size={15} />
                            </a>
                            <a
                                href={trashHref ?? `/${workspaceId}/team/trash`}
                                title="Thùng rác"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                                <Trash2 size={15} />
                            </a>
                            <button
                                type="button"
                                onClick={reload}
                                title="Tải lại"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                            >
                                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                            </button>
                            <NewMenu
                                onUploadFiles={() => filesInputRef.current?.click()}
                                onUploadFolder={() => folderInputRef.current?.click()}
                                onNewFolder={startNewFolder}
                            />
                        </div>
                    </div>

                    {/* content — whole area is an OS-file drop target + right-click context menu */}
                    <TeamContextMenuRoot onOpenTarget={handleOpenTarget} renderContent={renderMenu}>
                        <div
                            className={`relative min-h-[420px] flex-1 overflow-y-auto p-4 ${selectionActive ? 'pb-24' : ''}`}
                            onDragEnter={onDragEnter}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                        >
                            {dragOver && !assetFileHover && <DropOverlay folderName={currentName} />}
                            {loading ? (
                                <LoadingState prefs={prefs} gridStyle={gridStyle} expected={currentFolder?.itemCount} />
                            ) : error ? (
                                <ErrorState message={error} onRetry={reload} />
                            ) : isEmpty ? (
                                <EmptyState
                                    atRoot={folderId === null}
                                    onUpload={() => filesInputRef.current?.click()}
                                    onNewFolder={startNewFolder}
                                />
                            ) : prefs.layout === 'list' ? (
                                <>
                                    {(showNewFolderTile || liveItems.length > 0) && (
                                        <div className="mb-4 grid gap-3" style={gridStyle}>
                                            {tileEditing && <NewFolderTile onCommit={commitNewFolder} />}
                                            {tilePending && pendingFolderName && <PendingFolderTile name={pendingFolderName} />}
                                            {liveItems.map((it) => (
                                                <UploadingCard key={it.id} item={it} aspect={prefs.aspect} showInfo={prefs.showInfo} />
                                            ))}
                                        </div>
                                    )}
                                    <TeamListView
                                        folders={folders}
                                        assets={visibleAssets}
                                        sortField={sortField}
                                        sortDir={sortDir}
                                        onSort={onSortColumn}
                                        selectedIds={selectedIds}
                                        onRowClick={onItemClick}
                                        onToggle={onToggleSelect}
                                        onSelectAllVisible={onSelectAllVisible}
                                        allVisibleSelected={allVisibleSelected}
                                        renamingId={renamingId}
                                        onCommitRename={(name) => renamingId && commitRename(renamingId, name)}
                                        onCancelRename={() => setRenamingId(null)}
                                        onOpenFolder={go}
                                        onOpenAsset={openAsset}
                                        onSetStatus={doSetStatus}
                                    />
                                    {selectedAsset && selectedIds.size === 1 && (
                                        <InfoPanel
                                            asset={selectedAsset}
                                            onClose={clearSelection}
                                            onSetStatus={(s) => doSetStatus(selectedAsset.id, s)}
                                            onManageVersions={() => openManageVersions(selectedAsset.id)}
                                        />
                                    )}
                                    <LoadMore show={!!nextCursor} loading={loadingMore} onClick={loadMore} />
                                </>
                            ) : (
                                <>
                                    {(folders.length > 0 || showNewFolderTile) && (
                                        <Section label="Thư mục" count={folders.length + (showNewFolderTile ? 1 : 0)}>
                                            <div className="grid gap-3" style={gridStyle}>
                                                {tileEditing && <NewFolderTile onCommit={commitNewFolder} />}
                                                {tilePending && pendingFolderName && <PendingFolderTile name={pendingFolderName} />}
                                                {folders.map((f) => (
                                                    <FolderCardGrid
                                                        key={f.id}
                                                        folder={f}
                                                        selected={selectedIds.has(f.id)}
                                                        renaming={renamingId === f.id}
                                                        onSelect={(e) => onItemClick(f.id, e)}
                                                        onToggle={() => onToggleSelect(f.id)}
                                                        onOpen={() => go(f.id)}
                                                        onCommitRename={(name) => commitRename(f.id, name)}
                                                        onCancelRename={() => setRenamingId(null)}
                                                        dnd={dnd}
                                                    />
                                                ))}
                                            </div>
                                        </Section>
                                    )}
                                    {(liveItems.length > 0 || visibleAssets.length > 0) && (
                                        <Section label="Video" count={liveItems.length + visibleAssets.length}>
                                            <div className="grid gap-3" style={gridStyle}>
                                                {liveItems.map((it) => (
                                                    <UploadingCard key={it.id} item={it} aspect={prefs.aspect} showInfo={prefs.showInfo} />
                                                ))}
                                                {visibleAssets.map((a) => (
                                                    <AssetCardGrid
                                                        key={a.id}
                                                        asset={a}
                                                        aspect={prefs.aspect}
                                                        thumb={prefs.thumb}
                                                        showInfo={prefs.showInfo}
                                                        selected={selectedIds.has(a.id)}
                                                        renaming={renamingId === a.id}
                                                        onSelect={(e) => onItemClick(a.id, e)}
                                                        onToggle={() => onToggleSelect(a.id)}
                                                        onOpen={() => openAsset(a)}
                                                        onCommitRename={(name) => commitRename(a.id, name)}
                                                        onCancelRename={() => setRenamingId(null)}
                                                        onSetStatus={(s) => doSetStatus(a.id, s)}
                                                        dnd={dnd}
                                                    />
                                                ))}
                                            </div>
                                        </Section>
                                    )}
                                    {selectedAsset && selectedIds.size === 1 && (
                                        <InfoPanel
                                            asset={selectedAsset}
                                            onClose={clearSelection}
                                            onSetStatus={(s) => doSetStatus(selectedAsset.id, s)}
                                            onManageVersions={() => openManageVersions(selectedAsset.id)}
                                        />
                                    )}
                                    <LoadMore show={!!nextCursor} loading={loadingMore} onClick={loadMore} />
                                </>
                            )}
                        </div>
                    </TeamContextMenuRoot>
                </section>
            </div>

            {/* multi-select bottom bar */}
            {selectionActive && (
                <SelectionBar
                    folders={selectedFolders}
                    assets={selectedAssets}
                    atCap={selectedIds.size >= SEL_CAP}
                    canDelete={canDeleteItems(toItemRefs([...selectedIds]))}
                    onDownload={() => doDownload(toItemRefs([...selectedIds]))}
                    onMove={() => openMoveCopy('move', toItemRefs([...selectedIds]))}
                    onCopy={() => openMoveCopy('copy', toItemRefs([...selectedIds]))}
                    onDelete={() => requestDelete(toItemRefs([...selectedIds]))}
                    onClear={clearSelection}
                    onManageVersions={
                        selectedFolders.length === 0 && selectedAssets.length === 1
                            ? () => openManageVersions(selectedAssets[0].id)
                            : undefined
                    }
                />
            )}

            {/* Move / Copy destination picker */}
            {moveCopy && (
                <MoveCopyDialog
                    open
                    mode={moveCopy.mode}
                    workspaceId={workspaceId}
                    folderItemIds={moveCopy.items.filter((i) => i.type === 'folder').map((i) => i.id)}
                    onClose={() => setMoveCopy(null)}
                    onConfirm={doMoveCopyConfirm}
                />
            )}

            {/* Delete confirm */}
            <ConfirmModal
                open={!!confirmState}
                message={confirmState?.message ?? ''}
                confirmLabel="Xóa"
                onCancel={() => setConfirmState(null)}
                onConfirm={doDeleteConfirmed}
            />

            {/* P3.6 asset → asset merge confirm */}
            <ConfirmModal
                open={!!mergeConfirm}
                tone="primary"
                title="Gộp thành phiên bản mới?"
                icon={<Layers size={17} />}
                message={
                    mergeConfirm
                        ? `Gộp “${mergeConfirm.sourceName}” vào “${mergeConfirm.targetName}”? Các phiên bản của “${mergeConfirm.sourceName}” (kèm bình luận) sẽ trở thành phiên bản mới nhất của “${mergeConfirm.targetName}”.`
                        : ''
                }
                confirmLabel="Gộp"
                onCancel={() => setMergeConfirm(null)}
                onConfirm={doMergeConfirmed}
            />

            {/* P5.5 Create Share Link */}
            {shareTarget && <ShareLinkModal target={shareTarget} onClose={() => setShareTarget(null)} />}

            {/* P3.4 Manage Versions */}
            {manageVersionsId && (
                <ManageVersionsModal
                    assetId={manageVersionsId}
                    open
                    onClose={() => setManageVersionsId(null)}
                    onChanged={() => {
                        silentReplace()
                        void refreshTree()
                    }}
                    onOpenVersion={() => toast('Trình xem sẽ có ở bản sau.')}
                />
            )}
        </div>
    )
}

/* ── delete confirm modal ────────────────────────────────────────────────── */

function ConfirmModal({
    open,
    message,
    confirmLabel,
    onCancel,
    onConfirm,
    title = 'Xác nhận xóa',
    tone = 'danger',
    icon,
}: {
    open: boolean
    message: string
    confirmLabel: string
    onCancel: () => void
    onConfirm: () => void
    title?: string
    tone?: 'danger' | 'primary'
    icon?: ReactNode
}) {
    const headIcon = icon ?? <Trash2 size={17} />
    const iconBox = tone === 'danger' ? 'bg-red-500/10 text-red-300' : 'bg-violet-500/10 text-violet-300'
    const confirmBtn = tone === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-violet-500 hover:bg-violet-600'
    return (
        <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" />
                <Dialog.Content
                    className="fixed left-1/2 top-1/2 z-50 w-[380px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-zinc-950/95 p-5 shadow-2xl shadow-black/70 backdrop-blur-xl"
                    style={{ fontFamily: "var(--font-sans), 'Plus Jakarta Sans', sans-serif" }}
                >
                    <div className="mb-3 flex items-center gap-2.5">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBox}`}>
                            {headIcon}
                        </div>
                        <Dialog.Title className="text-[14px] font-semibold text-zinc-100">{title}</Dialog.Title>
                    </div>
                    <Dialog.Description className="mb-5 text-[12.5px] leading-relaxed text-zinc-400">{message}</Dialog.Description>
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded-lg px-3.5 py-2 text-[12.5px] font-medium text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-semibold text-white transition-colors ${confirmBtn}`}
                        >
                            {tone === 'danger' ? <Trash2 size={14} /> : <Layers size={14} />} {confirmLabel}
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

/* ── breadcrumb (collapses the middle to a "…" dropdown for deep paths — FR-B02 AC1) ── */

function BreadcrumbTrail({
    trail,
    onNavigate,
}: {
    trail: { id: string | null; name: string }[]
    onNavigate: (id: string | null) => void
}) {
    const COLLAPSE_AFTER = 4
    const Sep = () => <ChevronRight size={13} className="shrink-0 text-muted-foreground" />
    const Crumb = ({ c, last }: { c: { id: string | null; name: string }; last: boolean }) =>
        last ? (
            <span className="truncate font-semibold text-zinc-100" title={c.name}>
                {c.name}
            </span>
        ) : (
            <button
                type="button"
                onClick={() => onNavigate(c.id)}
                className="max-w-[180px] truncate text-zinc-400 transition-colors hover:text-violet-300"
                title={c.name}
            >
                {c.name}
            </button>
        )

    if (trail.length <= COLLAPSE_AFTER) {
        return (
            <nav className="flex min-w-0 items-center gap-1 text-[13px]">
                {trail.map((c, i) => (
                    <span key={`${c.id ?? 'root'}-${i}`} className="flex min-w-0 items-center gap-1">
                        {i > 0 && <Sep />}
                        <Crumb c={c} last={i === trail.length - 1} />
                    </span>
                ))}
            </nav>
        )
    }

    // Deep path: first · "…" (hidden middle in a dropdown) · parent · current.
    const first = trail[0]
    const hidden = trail.slice(1, trail.length - 2)
    const tail = trail.slice(trail.length - 2)
    return (
        <nav className="flex min-w-0 items-center gap-1 text-[13px]">
            <Crumb c={first} last={false} />
            <Sep />
            <DropdownMenu.Root>
                <DropdownMenu.Trigger
                    className="flex h-6 items-center rounded px-1 text-zinc-400 outline-none transition-colors hover:bg-white/[0.06] hover:text-violet-300"
                    aria-label="Các cấp thư mục ẩn"
                >
                    <MoreHorizontal size={15} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                    <DropdownMenu.Content
                        align="start"
                        className="z-50 max-h-[320px] min-w-[180px] overflow-y-auto rounded-xl border border-white/10 bg-zinc-950/95 p-1 text-zinc-200 shadow-2xl shadow-black/60 backdrop-blur-xl"
                    >
                        {hidden.map((c, i) => (
                            <DropdownMenu.Item
                                key={`${c.id ?? 'h'}-${i}`}
                                onSelect={() => onNavigate(c.id)}
                                className="flex cursor-pointer items-center gap-2 truncate rounded-lg px-2.5 py-[7px] text-[12.5px] outline-none data-[highlighted]:bg-violet-500/15 data-[highlighted]:text-white"
                                style={{ paddingLeft: 10 + i * 10 }}
                            >
                                <FolderIcon size={13} className="shrink-0 text-muted-foreground" />
                                <span className="truncate">{c.name}</span>
                            </DropdownMenu.Item>
                        ))}
                    </DropdownMenu.Content>
                </DropdownMenu.Portal>
            </DropdownMenu.Root>
            {tail.map((c, i) => (
                <span key={`${c.id ?? 'root'}-t${i}`} className="flex min-w-0 items-center gap-1">
                    <Sep />
                    <Crumb c={c} last={i === tail.length - 1} />
                </span>
            ))}
        </nav>
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
            <p className="px-3 py-6 text-center text-[11.5px] leading-relaxed text-muted-foreground">
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
                            className="flex h-6 w-5 items-center justify-center text-muted-foreground hover:text-zinc-200"
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
                        title={isRoot ? REVIEW_MODULE_LABEL : node.name}
                    >
                        <FolderIcon size={14} className={selected ? 'shrink-0 text-violet-300' : 'shrink-0 text-muted-foreground'} />
                        <span className="truncate text-[12.5px]">{isRoot ? REVIEW_MODULE_LABEL : node.name}</span>
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
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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

/* ── optimistic "creating…" folder tile ── */

function PendingFolderTile({ name }: { name: string }) {
    return (
        <div className="flex flex-col rounded-xl border border-white/5 bg-white/[0.03] p-3 opacity-70">
            <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
                    <FolderIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-zinc-100" title={name}>
                        {name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 size={11} className="animate-spin" /> Đang tạo…
                    </div>
                </div>
            </div>
        </div>
    )
}

/* ── states ──────────────────────────────────────────────────────────────── */

function LoadingState({ prefs, gridStyle, expected }: { prefs: ViewPrefs; gridStyle: React.CSSProperties; expected?: number }) {
    // [L12] Skeleton count was hardcoded (8 grid / 6 list) → ~9 ghost cards for a 1-item folder.
    // Derive from the known item count when available (exact on a same-folder reload), clamped to
    // [1, cap] so the fallback (fresh cross-folder nav, currentFolder still null) equals the old cap.
    const cap = prefs.layout === 'list' ? 6 : 8
    const n = Math.min(Math.max(expected ?? cap, 1), cap)
    if (prefs.layout === 'list') {
        return (
            <div className="flex flex-col gap-1.5">
                {Array.from({ length: n }).map((_, i) => (
                    <div key={i} className="h-12 animate-pulse rounded-lg border border-white/5 bg-white/[0.03]" />
                ))}
            </div>
        )
    }
    return (
        <div className="grid gap-3" style={gridStyle}>
            {Array.from({ length: n }).map((_, i) => (
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

function EmptyState({ atRoot, onUpload, onNewFolder }: { atRoot: boolean; onUpload: () => void; onNewFolder: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
                <Clapperboard size={26} />
            </div>
            <div>
                <p className="text-[14px] font-medium text-zinc-200">
                    {atRoot ? 'Chưa có asset nào trong workspace này' : 'Thư mục trống'}
                </p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                    {atRoot
                        ? 'Upload video từ khối BÀN GIAO của task để hệ thống tự tạo thư mục theo khách hàng, hoặc kéo thả file vào đây.'
                        : 'Kéo thả file vào đây, hoặc dùng nút “+ Mới” để tải lên.'}
                </p>
            </div>
            <div className="mt-1 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onUpload}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-primary/90"
                >
                    <UploadCloud size={14} /> Tải asset lên
                </button>
                <button
                    type="button"
                    onClick={onNewFolder}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-4 py-2 text-[12.5px] font-medium text-zinc-200 transition-colors hover:bg-white/[0.12]"
                >
                    <FolderPlus size={14} /> Thư mục mới
                </button>
            </div>
        </div>
    )
}
