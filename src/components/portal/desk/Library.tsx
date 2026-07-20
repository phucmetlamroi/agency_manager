'use client'

/* THE DESK — Files & masters.
 *
 * Parity target: the INTERNAL staff browser (src/components/review/TeamBrowser.tsx).
 * The owner's instruction was that a client's file flows should work the same way staff's
 * do — same selection model, same navigation, same download — and differ ONLY in that a
 * client can never upload, delete, rename or move. The skin stays The Desk (light,
 * Editorial), never the dark internal UI.
 *
 * So: ctrl/shift-click ranges, Ctrl+A, Esc, right-click, a "…" menu, grid/list, card size,
 * six sort fields, search, breadcrumb collapse, windowing. Every WRITE affordance is absent
 * rather than disabled — a greyed-out Delete reads as a broken app, not as a boundary; one
 * honest line at the top explains the boundary instead.
 *
 * Everything here is client-side over the snapshot the token already returns
 * (getDocumentsViaToken). No new server capability, no new query, no schema change.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
    Folder, Building2, ChevronRight, FileVideo, FileImage, FileArchive, Download, Play,
    Loader, Search, X, MoreHorizontal, LayoutGrid, List as ListIcon, Check, Info,
    Lock, AlertCircle, MessageSquare, SlidersHorizontal,
} from 'lucide-react'
import { Kicker, Empty, Button, StatusPill, Sheet, SheetHeader, useToast } from './ui'
import { fmtDate } from '../calm/format'
import type { DeliverableActions, DocumentsSnapshot, DocumentFolder, DocumentAsset } from '../calm/types'

/* ── constants ───────────────────────────────────────────────────────────── */

/** Mirrors the internal SEL_CAP (TeamBrowser.tsx:117) — but for a different reason.
 *  Staff cap at 200 because bulk MUTATIONS cap at 200. The client mutates nothing; the
 *  real constraint is URL length, since every ticked id rides in the zip query string. */
const SEL_CAP = 200
/** Cards rendered before the "Show more" pill. The snapshot arrives uncapped. */
const WINDOW = 120
/** Breadcrumbs before the middle collapses behind a "…" (internal COLLAPSE_AFTER). */
const COLLAPSE_AFTER = 4
const PREFS_KEY = 'desk.library.view'
const CARD_MIN: Record<CardSize, number> = { S: 148, M: 196, L: 260 }

type CardSize = 'S' | 'M' | 'L'
type Layout = 'grid' | 'list'
type SortField = 'name' | 'date' | 'status' | 'duration' | 'size' | 'notes'
const SORT_LABEL: Record<SortField, string> = {
    name: 'Name', date: 'Date delivered', status: 'Status',
    duration: 'Duration', size: 'Size', notes: 'Notes',
}

/* ── formatting ──────────────────────────────────────────────────────────── */

function fmtBytes(raw: string | number): string {
    const n = Number(raw || 0)
    if (!n) return '—'
    const u = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0, v = n
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`
}

function fmtDur(ms: number | null | undefined): string | null {
    if (!ms || ms <= 0) return null
    const s = Math.round(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
}

/* ── view prefs (localStorage, whitelisted like the internal loadPrefs) ───── */

type Prefs = { layout: Layout; size: CardSize; details: boolean; sort: SortField; dir: 'asc' | 'desc' }
const DEFAULT_PREFS: Prefs = { layout: 'grid', size: 'M', details: true, sort: 'date', dir: 'desc' }

function loadPrefs(): Prefs {
    if (typeof window === 'undefined') return DEFAULT_PREFS
    try {
        const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}')
        return {
            layout: raw.layout === 'list' ? 'list' : 'grid',
            size: (['S', 'M', 'L'] as const).includes(raw.size) ? raw.size : 'M',
            details: raw.details !== false,
            sort: (Object.keys(SORT_LABEL) as SortField[]).includes(raw.sort) ? raw.sort : 'date',
            dir: raw.dir === 'asc' ? 'asc' : 'desc',
        }
    } catch { return DEFAULT_PREFS }
}

/* ── a popover that can hang off a button OR off the cursor ──────────────── */

type MenuItem = { label: string; onClick: () => void; icon?: React.ComponentType<{ size?: number }> }

function Menu({ items, at, onClose }: { items: MenuItem[]; at: { x: number; y: number }; onClose: () => void }) {
    const ref = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
        window.addEventListener('mousedown', away)
        window.addEventListener('keydown', esc, true)
        return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc, true) }
    }, [onClose])
    // Keep the panel on screen — a right-click near the right edge must not clip.
    const x = Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 210)
    const y = Math.min(at.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - (items.length * 34 + 16))
    return (
        <div
            ref={ref}
            role="menu"
            className="desk-card"
            style={{ position: 'fixed', left: x, top: y, zIndex: 90, minWidth: 196, padding: 6, boxShadow: 'var(--shadow-pop)' }}
        >
            {items.map(it => (
                <button
                    key={it.label}
                    role="menuitem"
                    onClick={() => { it.onClick(); onClose() }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 10px', fontSize: '0.83rem', color: 'var(--ink)', textAlign: 'left', fontFamily: 'var(--font-body)', borderRadius: 3 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--paper-tint)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                    {it.icon ? <it.icon size={14} /> : <span style={{ width: 14 }} />}
                    {it.label}
                </button>
            ))}
        </div>
    )
}

/* ── the surface ─────────────────────────────────────────────────────────── */

export default function Library({ actions, wsScope = 'all', clientScope = 'all' }: {
    actions: DeliverableActions
    /** [A1] The masthead period tab. Previously the Library ignored it entirely — the
     *  mount carried a remount `key` but no prop, so switching period changed nothing on
     *  screen. A client seeing last month's files under "July" is a direct generator of
     *  "a lot of stuff is kind of going missing". */
    wsScope?: string | 'all'
    /** The rail's channel/brand filter, same story. */
    clientScope?: number | 'all'
}) {
    const toast = useToast()
    const [snap, setSnap] = useState<DocumentsSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [failed, setFailed] = useState(false)          // C9 — a real error state
    const [folderId, setFolderId] = useState<string | null>(null)
    const [sel, setSel] = useState<Set<string>>(new Set())
    /** Ticked FOLDERS. Staff can select folders and files together, so a client can too —
     *  the zip route expands each selected folder's whole subtree server-side, which also
     *  keeps a hundred-file folder out of the URL. */
    const [selFolders, setSelFolders] = useState<Set<string>>(new Set())
    const [anchor, setAnchor] = useState<string | null>(null)   // shift-click range origin
    const [downloading, setDownloading] = useState(false)
    const [q, setQ] = useState('')
    const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS)
    const [showView, setShowView] = useState(false)
    const [limit, setLimit] = useState(WINDOW)
    const [detail, setDetail] = useState<DocumentAsset | null>(null)
    const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: MenuItem[] } | null>(null)
    const searchRef = useRef<HTMLInputElement>(null)

    useEffect(() => { setPrefs(loadPrefs()) }, [])
    useEffect(() => {
        try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* private mode */ }
    }, [prefs])

    const load = () => {
        if (!actions.documents) { setLoading(false); return }
        setLoading(true); setFailed(false)
        actions.documents()
            .then(s => { setSnap(s); setFailed(s === null); setLoading(false) })
            .catch(() => { setFailed(true); setLoading(false) })
    }
    useEffect(() => { load() /* eslint-disable-next-line */ }, [])

    /* ── A1: the period / channel filter, applied to BOTH folders and assets ── */
    // A null workspaceId/clientId means "we don't know" (the snapshot synthesises a few
    // folders). Treat unknown as VISIBLE, never as filtered-out: the entire complaint that
    // started this work was things disappearing, so an ambiguous row must fail towards
    // being shown.
    const inScope = (x: { workspaceId: string | null; clientId: number | null }) =>
        (wsScope === 'all' || x.workspaceId == null || x.workspaceId === wsScope) &&
        (clientScope === 'all' || x.clientId == null || x.clientId === clientScope)

    const allFolders = useMemo(() => (snap?.folders || []).filter(inScope), [snap, wsScope, clientScope])
    const allAssets = useMemo(() => (snap?.assets || []).filter(inScope), [snap, wsScope, clientScope])

    /* ── sort ─────────────────────────────────────────────────────────────── */
    const sortAssets = (list: DocumentAsset[]) => {
        const s = [...list]
        const dir = prefs.dir === 'asc' ? 1 : -1
        s.sort((a, b) => {
            switch (prefs.sort) {
                case 'name': return dir * a.title.localeCompare(b.title)
                case 'status': return dir * (a.statusLabel || '').localeCompare(b.statusLabel || '')
                case 'duration': return dir * ((a.currentVersion.durationMs ?? 0) - (b.currentVersion.durationMs ?? 0))
                case 'size': return dir * (Number(a.currentVersion.sizeBytes) - Number(b.currentVersion.sizeBytes))
                case 'notes': return dir * ((a.currentVersion.publicCommentCount ?? 0) - (b.currentVersion.publicCommentCount ?? 0))
                default: return dir * a.createdAt.localeCompare(b.createdAt)
            }
        })
        return s
    }

    /* ── A3: search runs over the WHOLE library, not just the open folder ──── */
    const term = q.trim().toLowerCase()
    const searching = term.length > 0
    const folderNameById = useMemo(() => new Map(allFolders.map(f => [f.id, f.name])), [allFolders])
    const pathOf = (fid: string): string => {
        const segs: string[] = []
        const byId = new Map(allFolders.map(f => [f.id, f]))
        let cur: string | null = fid
        let guard = 0
        while (cur && guard++ < 24) { const f = byId.get(cur); if (!f) break; segs.unshift(f.name); cur = f.parentId }
        return segs.join(' / ')
    }

    const results = useMemo(() => {
        if (!searching) return []
        return sortAssets(allAssets.filter(a =>
            a.title.toLowerCase().includes(term) ||
            (a.currentVersion.fileName || '').toLowerCase().includes(term) ||
            (folderNameById.get(a.folderId) || '').toLowerCase().includes(term),
        ))
        // eslint-disable-next-line
    }, [term, allAssets, prefs.sort, prefs.dir])

    const folders = useMemo(
        () => allFolders.filter(f => f.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name)),
        [allFolders, folderId],
    )
    const assets = useMemo(
        () => sortAssets(allAssets.filter(a => a.folderId === folderId)),
        // eslint-disable-next-line
        [allAssets, folderId, prefs.sort, prefs.dir],
    )

    const shown = searching ? results : assets
    const windowed = shown.slice(0, limit)
    useEffect(() => { setLimit(WINDOW) }, [folderId, term, wsScope, clientScope])

    const crumbs = useMemo(() => {
        const out: DocumentFolder[] = []
        const map = new Map(allFolders.map(f => [f.id, f]))
        let cur = folderId
        let guard = 0
        while (cur && guard++ < 24) { const f = map.get(cur); if (!f) break; out.unshift(f); cur = f.parentId }
        return out
    }, [allFolders, folderId])

    /* ── selection: the internal model, click-for-click ───────────────────── */
    const orderedIds = useMemo(() => shown.map(a => a.id), [shown])

    const selectOnly = (id: string) => { setSel(new Set([id])); setAnchor(id) }
    const toggle = (id: string) => {
        setSel(prev => {
            const n = new Set(prev)
            if (n.has(id)) n.delete(id)
            else {
                if (n.size >= SEL_CAP) { toast('err', `You can download ${SEL_CAP} files at a time — use “Download this folder” for more.`); return prev }
                n.add(id)
            }
            return n
        })
        setAnchor(id)
    }
    const selectRange = (to: string) => {
        const from = anchor ?? to
        const i = orderedIds.indexOf(from), j = orderedIds.indexOf(to)
        if (i < 0 || j < 0) { selectOnly(to); return }
        const slice = orderedIds.slice(Math.min(i, j), Math.max(i, j) + 1)
        setSel(prev => {
            const n = new Set(prev)
            for (const id of slice) { if (n.size >= SEL_CAP) break; n.add(id) }
            if (n.size >= SEL_CAP) toast('err', `${SEL_CAP}-file limit reached for one download.`)
            return n
        })
    }
    const onCardClick = (a: DocumentAsset, e: React.MouseEvent) => {
        if (e.shiftKey) { e.preventDefault(); selectRange(a.id); return }
        if (e.metaKey || e.ctrlKey) { e.preventDefault(); toggle(a.id); return }
        setDetail(a)   // B1: a plain click OPENS, it no longer silently ticks
    }

    // Ctrl+A / Esc, and "/" to jump into search — the internal keyboard contract.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null
            const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
            if (e.key === 'Escape' && !typing) { clearAll(); setDetail(null); return }
            if (typing) return
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); return }
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
                e.preventDefault()
                setSel(new Set(orderedIds.slice(0, SEL_CAP)))
                if (orderedIds.length > SEL_CAP) toast('err', `${SEL_CAP}-file limit reached for one download.`)
            }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
        // eslint-disable-next-line
    }, [orderedIds])

    /* ── download ─────────────────────────────────────────────────────────── */
    const picked = sel.size + selFolders.size
    const clearAll = () => { setSel(new Set()); setSelFolders(new Set()) }
    const download = async () => {
        if (picked === 0 || downloading) return
        if (actions.zipUrlForAssets) {
            window.location.href = actions.zipUrlForAssets(Array.from(sel), Array.from(selFolders))
            toast('ok', `Preparing your download…`)
            clearAll()
            return
        }
        if (selFolders.size) { toast('err', 'Open a folder to download its files.'); return }
        if (!actions.downloadDocuments) return
        setDownloading(true)
        const versionIds = allAssets.filter(a => sel.has(a.id)).map(a => a.currentVersion.id)
        const res = await actions.downloadDocuments(versionIds)
        setDownloading(false)
        if (res.success && res.files) {
            for (const f of res.files) {
                const el = document.createElement('a')
                el.href = f.url; el.download = f.fileName; el.rel = 'noopener'
                document.body.appendChild(el); el.click(); el.remove()
            }
            toast('ok', `${res.files.length} file${res.files.length === 1 ? '' : 's'} downloading.`)
            setSel(new Set())
        } else toast('err', res.error || 'Could not prepare the download.')
    }
    const downloadOne = (a: DocumentAsset) => {
        if (actions.zipUrlForAssets) { window.location.href = actions.zipUrlForAssets([a.id]); toast('ok', 'Preparing your file…') }
    }

    /* ── menus (the "…" button and right-click share one builder) ─────────── */
    const assetMenu = (a: DocumentAsset): MenuItem[] => [
        ...(a.reviewUrl && a.mediaKind === 'video'
            ? [{ label: 'Watch', icon: Play, onClick: () => window.open(a.reviewUrl!, '_blank', 'noopener') }]
            : []),
        { label: 'Download', icon: Download, onClick: () => downloadOne(a) },
        { label: 'Details', icon: Info, onClick: () => setDetail(a) },
        { label: sel.has(a.id) ? 'Deselect' : 'Select', icon: Check, onClick: () => toggle(a.id) },
    ]
    const toggleFolder = (id: string) =>
        setSelFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
    const folderMenu = (f: DocumentFolder): MenuItem[] => [
        { label: 'Open', icon: Folder, onClick: () => setFolderId(f.id) },
        ...(actions.zipUrl ? [{ label: 'Download this folder', icon: Download, onClick: () => { window.location.href = actions.zipUrl!(f.id) } }] : []),
        { label: selFolders.has(f.id) ? 'Deselect' : 'Select', icon: Check, onClick: () => toggleFolder(f.id) },
    ]
    const canvasMenu = (): MenuItem[] => [
        { label: 'Select all', icon: Check, onClick: () => setSel(new Set(orderedIds.slice(0, SEL_CAP))) },
        ...(actions.zipUrl ? [{ label: 'Download everything here', icon: Download, onClick: () => { window.location.href = actions.zipUrl!(folderId) } }] : []),
    ]
    const openMenu = (e: React.MouseEvent, items: MenuItem[]) => {
        e.preventDefault(); e.stopPropagation()
        setMenu({ at: { x: e.clientX, y: e.clientY }, items })
    }

    /* ── states ───────────────────────────────────────────────────────────── */

    if (loading) {
        return (
            <main style={{ padding: '26px 30px' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: '0 0 20px' }}>Files &amp; masters</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-3)' }}>
                    <Loader size={16} className="desk-spin" /> <span style={{ fontSize: '0.86rem' }}>Opening the library…</span>
                </div>
            </main>
        )
    }

    // C9 — previously a failed fetch fell through to "Nothing here yet", telling a client
    // their files did not exist when in fact the request had failed.
    if (failed) {
        return (
            <main style={{ padding: '26px 30px' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: '0 0 20px' }}>Files &amp; masters</h1>
                <Empty icon={AlertCircle} title="We couldn’t load your library" sub="This is on our side, not yours — nothing has been lost." />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                    <Button variant="secondary" size="sm" onClick={load}>Try again</Button>
                </div>
            </main>
        )
    }

    const nothingAtAll = !snap || (allFolders.length === 0 && allAssets.length === 0)
    const emptyHere = folders.length === 0 && shown.length === 0
    const filtered = wsScope !== 'all' || clientScope !== 'all'

    return (
        <main
            style={{ padding: '26px 30px', minHeight: 'calc(100vh - 58px)' }}
            onContextMenu={e => openMenu(e, canvasMenu())}
        >
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 4, flexWrap: 'wrap' }}>
                <h1 className="desk-display" style={{ fontSize: '1.6rem', margin: 0 }}>Files &amp; masters</h1>
                {snap && (
                    <span className="desk-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>
                        {allFolders.length} FOLDERS · {allAssets.length} FILES · {fmtBytes(allAssets.reduce((s, a) => s + Number(a.currentVersion.sizeBytes || 0), 0))}
                    </span>
                )}
            </div>

            {/* D2 — the read-only boundary, stated once and plainly. The alternative was a
                row of greyed-out Upload/Delete buttons, which reads as a broken app. */}
            <p style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '0.86rem', color: 'var(--ink-2)', margin: '0 0 16px' }}>
                <Lock size={13} style={{ flexShrink: 0, color: 'var(--ink-3)' }} />
                Your delivered originals — yours to watch and download. Only the studio can add or remove files here.
            </p>

            {/* toolbar: search · view · sort · download-all */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                <span style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
                    <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
                    <input
                        ref={searchRef}
                        className="desk-input"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        placeholder="Search files and folders…"
                        aria-label="Search files and folders"
                        style={{ width: '100%', paddingLeft: 32, paddingRight: q ? 30 : 12 }}
                    />
                    {q && (
                        <button onClick={() => setQ('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}>
                            <X size={14} />
                        </button>
                    )}
                </span>

                <span style={{ position: 'relative' }}>
                    <Button variant="quiet" size="sm" onClick={() => setShowView(v => !v)} aria-expanded={showView}>
                        <SlidersHorizontal size={13} style={{ marginRight: 6 }} /> View
                    </Button>
                    {showView && (
                        <>
                            <span onClick={() => setShowView(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                            <div className="desk-card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 61, width: 232, padding: 14, boxShadow: 'var(--shadow-pop)' }}>
                                <Kicker style={{ marginBottom: 8 }}>Layout</Kicker>
                                <Seg value={prefs.layout} onChange={v => setPrefs(p => ({ ...p, layout: v }))}
                                    options={[{ v: 'grid' as Layout, label: 'Grid', icon: LayoutGrid }, { v: 'list' as Layout, label: 'List', icon: ListIcon }]} />
                                <Kicker style={{ margin: '14px 0 8px' }}>Card size</Kicker>
                                <Seg value={prefs.size} onChange={v => setPrefs(p => ({ ...p, size: v }))}
                                    options={(['S', 'M', 'L'] as CardSize[]).map(v => ({ v, label: v }))} />
                                <Kicker style={{ margin: '14px 0 8px' }}>Sort by</Kicker>
                                <select
                                    className="desk-input"
                                    value={prefs.sort}
                                    onChange={e => setPrefs(p => ({ ...p, sort: e.target.value as SortField }))}
                                    style={{ width: '100%', fontSize: '0.82rem' }}
                                    aria-label="Sort by"
                                >
                                    {(Object.keys(SORT_LABEL) as SortField[]).map(f => <option key={f} value={f}>{SORT_LABEL[f]}</option>)}
                                </select>
                                <div style={{ marginTop: 8 }}>
                                    <Seg value={prefs.dir} onChange={v => setPrefs(p => ({ ...p, dir: v }))}
                                        options={[{ v: 'desc' as const, label: 'Newest first' }, { v: 'asc' as const, label: 'Oldest first' }]} />
                                </div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={prefs.details} onChange={e => setPrefs(p => ({ ...p, details: e.target.checked }))} style={{ accentColor: 'var(--accent)' }} />
                                    Show file details
                                </label>
                            </div>
                        </>
                    )}
                </span>

                {actions.zipUrl && !nothingAtAll && !searching && (
                    <a
                        href={actions.zipUrl(folderId)}
                        className="desk-btn desk-btn--sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, textDecoration: 'none' }}
                    >
                        <Download size={13} /> {folderId ? 'Download this folder' : 'Download all'}
                    </a>
                )}
            </div>

            {/* A5 — breadcrumb, collapsing in the middle once it gets long */}
            {crumbs.length > 0 && !searching && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    <Crumb label="ALL" onClick={() => setFolderId(null)} />
                    {(crumbs.length > COLLAPSE_AFTER
                        ? [crumbs[0], null, ...crumbs.slice(-2)]
                        : crumbs
                    ).map((c, i) => (
                        <span key={c ? c.id : `gap${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <ChevronRight size={12} style={{ color: 'var(--ink-3)' }} />
                            {c
                                ? <Crumb label={c.name.toUpperCase()} onClick={() => setFolderId(c.id)} strong />
                                : <span className="desk-mono" style={{ fontSize: '0.7rem', color: 'var(--ink-3)' }}>…</span>}
                        </span>
                    ))}
                </div>
            )}

            {searching && (
                <Kicker style={{ marginBottom: 12 }}>{results.length} match{results.length === 1 ? '' : 'es'} for “{q.trim()}”</Kicker>
            )}

            {nothingAtAll ? (
                /* [Honest empty state] "Nothing here yet" was a lie whenever the library was
                   empty for a REASON — work still in production, or files still processing.
                   A client reading it concluded their delivered work had gone missing. Say
                   what is actually true. */
                <Empty
                    icon={Folder}
                    title="Nothing to download yet"
                    sub={
                        (snap?.summary.processingCount ?? 0) > 0
                            ? `${snap!.summary.processingCount} file${snap!.summary.processingCount === 1 ? ' is' : 's are'} still being processed — they appear here on their own.`
                            : (snap?.summary.inProgressCount ?? 0) > 0
                                ? `${snap!.summary.inProgressCount} video${snap!.summary.inProgressCount === 1 ? '' : 's'} still in production. Files land here as each one is delivered.`
                                : 'Files appear the moment a video is delivered — originals, not previews.'
                    }
                />
            ) : emptyHere ? (
                searching
                    ? <Empty icon={Search} title={`No file matches “${q.trim()}”`} sub="Try a shorter word, or clear the period filter." />
                    : filtered
                        ? <Empty icon={Folder} title="Nothing in this period" sub="Switch to All periods to see everything delivered so far." />
                        : <Empty icon={Folder} title="This folder is empty" sub="Nothing has been delivered into it yet." />
            ) : (
                <>
                    {folders.length > 0 && !searching && (
                        <>
                            <Kicker style={{ marginBottom: 10 }}>Folders · {folders.length}</Kicker>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 26 }}>
                                {folders.map(f => {
                                    // C8 — a client-root folder reads differently from a plain folder.
                                    const Glyph = f.kind === 'client' ? Building2 : Folder
                                    return (
                                        <div key={f.id} style={{ position: 'relative' }} onContextMenu={e => openMenu(e, folderMenu(f))}>
                                            <button onClick={() => setFolderId(f.id)} style={{ width: '100%', border: '1px solid ' + (selFolders.has(f.id) ? 'var(--accent)' : 'var(--hairline)'), background: selFolders.has(f.id) ? 'var(--accent-tint)' : 'var(--paper-raised)', padding: '16px 18px 16px 44px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', textAlign: 'left', borderRadius: 4 }}>
                                                <Glyph size={20} style={{ color: 'var(--ink-2)', flexShrink: 0 }} />
                                                <span style={{ minWidth: 0, flex: 1 }}>
                                                    <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>{f.name}</p>
                                                    <p className="desk-mono" style={{ fontSize: '0.6rem', color: 'var(--ink-3)', margin: '2px 0 0' }}>{f.itemCount} item{f.itemCount === 1 ? '' : 's'} · {fmtBytes(f.totalBytes)}</p>
                                                </span>
                                                <ChevronRight size={14} style={{ color: 'var(--ink-3)', flexShrink: 0, marginRight: 26 }} />
                                            </button>
                                            {/* Sibling, not nested — a <button> inside a <button> is invalid
                                                HTML and the inner one stops receiving clicks. */}
                                            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                                                <Tick on={selFolders.has(f.id)} onClick={() => toggleFolder(f.id)} title={selFolders.has(f.id) ? 'Deselect' : 'Select'} />
                                            </span>
                                            {actions.zipUrl && f.itemCount > 0 && (
                                                <a
                                                    href={actions.zipUrl(f.id)}
                                                    title={`Download everything in "${f.name}"`}
                                                    aria-label={`Download everything in ${f.name}`}
                                                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', color: 'var(--ink-2)' }}
                                                >
                                                    <Download size={14} />
                                                </a>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {shown.length > 0 && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                                <Kicker>Files · {shown.length}</Kicker>
                                <button
                                    onClick={() => setSel(prev => (windowed.every(a => prev.has(a.id))
                                        ? new Set()
                                        : new Set(orderedIds.slice(0, SEL_CAP))))}
                                    className="desk-mono"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.66rem', letterSpacing: '0.06em', padding: 0 }}
                                >
                                    {windowed.length > 0 && windowed.every(a => sel.has(a.id)) ? 'CLEAR SELECTION' : 'SELECT ALL'}
                                </button>
                            </div>

                            {prefs.layout === 'list' ? (
                                <ListView
                                    items={windowed} sel={sel} searching={searching} pathOf={pathOf}
                                    onRow={onCardClick} onTick={toggle} onMenu={(e, a) => openMenu(e, assetMenu(a))}
                                />
                            ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN[prefs.size]}px, 1fr))`, gap: 14 }}>
                                    {windowed.map(a => (
                                        <Card
                                            key={a.id} a={a} on={sel.has(a.id)} details={prefs.details}
                                            subPath={searching ? pathOf(a.folderId) : null}
                                            onClick={e => onCardClick(a, e)}
                                            onTick={() => toggle(a.id)}
                                            onMenu={e => openMenu(e, assetMenu(a))}
                                        />
                                    ))}
                                </div>
                            )}

                            {shown.length > windowed.length && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginTop: 22 }}>
                                    <Button variant="quiet" size="sm" onClick={() => setLimit(l => l + WINDOW)}>Show {Math.min(WINDOW, shown.length - windowed.length)} more</Button>
                                    <span className="desk-mono" style={{ fontSize: '0.62rem', color: 'var(--ink-3)' }}>SHOWING {windowed.length} OF {shown.length}</span>
                                </div>
                            )}
                        </>
                    )}

                    {/* D1 — the honest answer to "why isn't my file here?", which used to be
                        nowhere, leaving the client to conclude the work had been lost. */}
                    <p style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: '0.78rem', color: 'var(--ink-3)', margin: '30px 0 0', maxWidth: 620 }}>
                        <Info size={12} style={{ flexShrink: 0, marginTop: 3 }} />
                        Missing something? A file lands here once its production has been delivered to you. Anything still being edited, or still processing after upload, appears as soon as it is ready.
                    </p>
                    <div style={{ height: 80 }} />
                </>
            )}

            {picked > 0 && (
                <div style={{ position: 'fixed', left: '50%', bottom: 92, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--ink)', color: 'var(--ink-invert)', borderRadius: 999, padding: '10px 10px 10px 22px', boxShadow: 'var(--shadow-modal)', zIndex: 40 }} className="desk-rise">
                    <span style={{ fontSize: '0.84rem', fontWeight: 500 }}>
                        {[sel.size ? `${sel.size} file${sel.size === 1 ? '' : 's'}` : '', selFolders.size ? `${selFolders.size} folder${selFolders.size === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')} selected
                        {sel.size >= SEL_CAP ? ` · ${SEL_CAP}-file limit` : ''}
                    </span>
                    <Button variant="secondary" size="sm" onClick={download} disabled={downloading}>
                        <Download size={13} style={{ marginRight: 6 }} /> {downloading ? 'Preparing…' : 'Download'}
                    </Button>
                    <button onClick={clearAll} style={{ background: 'none', border: 'none', fontSize: '0.78rem', color: 'rgba(247,242,233,.6)', cursor: 'pointer', paddingRight: 8 }}>Clear</button>
                </div>
            )}

            {menu && <Menu items={menu.items} at={menu.at} onClose={() => setMenu(null)} />}
            {detail && <DetailSheet a={detail} path={pathOf(detail.folderId)} onClose={() => setDetail(null)} onDownload={() => downloadOne(detail)} />}
        </main>
    )
}

/* ── pieces ──────────────────────────────────────────────────────────────── */

function Crumb({ label, onClick, strong = false }: { label: string; onClick: () => void; strong?: boolean }) {
    return (
        <button onClick={onClick} className="desk-mono" style={{ background: 'none', border: 'none', cursor: 'pointer', color: strong ? 'var(--ink-2)' : 'var(--ink-3)', fontSize: '0.7rem', padding: 0, letterSpacing: '0.06em' }}>
            {label}
        </button>
    )
}

function Seg<T extends string>({ value, onChange, options }: {
    value: T
    onChange: (v: T) => void
    options: { v: T; label: string; icon?: React.ComponentType<{ size?: number }> }[]
}) {
    return (
        <div style={{ display: 'flex', gap: 4, background: 'var(--paper-tint)', padding: 3, borderRadius: 4 }}>
            {options.map(o => (
                <button
                    key={o.v}
                    onClick={() => onChange(o.v)}
                    aria-pressed={value === o.v}
                    style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: 'none', cursor: 'pointer', borderRadius: 3, padding: '5px 8px', fontSize: '0.74rem', fontFamily: 'var(--font-body)', background: value === o.v ? 'var(--paper-raised)' : 'transparent', color: value === o.v ? 'var(--ink)' : 'var(--ink-3)', boxShadow: value === o.v ? 'var(--shadow-card)' : 'none' }}
                >
                    {o.icon ? <o.icon size={12} /> : null}{o.label}
                </button>
            ))}
        </div>
    )
}

function Tick({ on, onClick, title }: { on: boolean; onClick: (e: React.MouseEvent) => void; title: string }) {
    return (
        <button
            onClick={e => { e.stopPropagation(); onClick(e) }}
            aria-label={on ? 'Deselect' : 'Select'}
            aria-pressed={on}
            title={title}
            style={{ width: 18, height: 18, flexShrink: 0, padding: 0, borderRadius: 2, cursor: 'pointer', border: '1.5px solid ' + (on ? 'var(--accent)' : 'var(--hairline-strong)'), background: on ? 'var(--accent)' : 'rgba(247,242,233,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
            {on && <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" strokeWidth={3}><path d="M5 13l4 4L19 7" /></svg>}
        </button>
    )
}

function iconFor(kind: string) {
    return kind === 'video' ? FileVideo : kind === 'image' ? FileImage : FileArchive
}

function Card({ a, on, details, subPath, onClick, onTick, onMenu }: {
    a: DocumentAsset; on: boolean; details: boolean; subPath: string | null
    onClick: (e: React.MouseEvent) => void; onTick: () => void; onMenu: (e: React.MouseEvent) => void
}) {
    const Icon = iconFor(a.mediaKind)
    const dur = fmtDur(a.currentVersion.durationMs)
    const notes = a.currentVersion.publicCommentCount ?? 0
    return (
        <div
            onClick={onClick}
            onContextMenu={onMenu}
            style={{ border: '1px solid ' + (on ? 'var(--accent)' : 'var(--hairline)'), background: on ? 'var(--accent-tint)' : 'var(--paper-raised)', cursor: 'pointer', borderRadius: 4, overflow: 'hidden' }}
        >
            <div style={{ position: 'relative', aspectRatio: '16/9', background: a.currentVersion.posterUrl ? '#09090b' : 'var(--paper-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {a.currentVersion.posterUrl
                    ? <span style={{ position: 'absolute', inset: 0, backgroundImage: `url(${a.currentVersion.posterUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', opacity: 0.82 }} />
                    : <Icon size={22} style={{ color: 'var(--ink-3)' }} />}
                {a.reviewUrl && a.mediaKind === 'video' && (
                    <a href={a.reviewUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, width: 34, height: 34, borderRadius: '50%', background: 'rgba(9,9,11,.62)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label={`Watch ${a.title}`}>
                        <Play size={15} fill="#f7f2e9" color="#f7f2e9" style={{ marginLeft: 2 }} />
                    </a>
                )}
                <span style={{ position: 'absolute', left: 6, top: 6 }}>
                    <Tick on={on} onClick={onTick} title={on ? 'Deselect' : 'Select'} />
                </span>
                <button
                    onClick={onMenu}
                    aria-label={`More actions for ${a.title}`}
                    style={{ position: 'absolute', right: 5, top: 5, width: 26, height: 26, borderRadius: 3, border: 'none', background: 'rgba(9,9,11,.5)', color: '#f7f2e9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <MoreHorizontal size={14} />
                </button>
                {dur && <span className="desk-mono" style={{ position: 'absolute', right: 6, bottom: 5, fontSize: '0.56rem', color: '#eae5d9', background: 'rgba(9,9,11,.65)', padding: '1px 5px' }}>{dur}</span>}
            </div>
            <div style={{ padding: '11px 13px' }}>
                <p className="desk-truncate" style={{ margin: 0, fontWeight: 600, fontSize: '0.84rem' }}>{a.title}</p>
                {subPath && <p className="desk-truncate desk-mono" style={{ fontSize: '0.56rem', color: 'var(--ink-3)', margin: '3px 0 0' }}>IN {subPath.toUpperCase()}</p>}
                {details && (
                    <>
                        <p className="desk-truncate" style={{ fontSize: '0.68rem', color: 'var(--ink-3)', margin: '4px 0 0' }}>{a.currentVersion.fileName}</p>
                        <p className="desk-mono" style={{ fontSize: '0.58rem', color: 'var(--ink-3)', margin: '3px 0 0' }}>
                            {fmtBytes(a.currentVersion.sizeBytes)} · {fmtDate(a.createdAt, false)}
                        </p>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                            {a.statusLabel && <StatusPill status={a.statusLabel} />}
                            {notes > 0 && (
                                <span className="desk-mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.58rem', color: 'var(--ink-3)' }}>
                                    <MessageSquare size={10} /> {notes}
                                </span>
                            )}
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}

function ListView({ items, sel, searching, pathOf, onRow, onTick, onMenu }: {
    items: DocumentAsset[]; sel: Set<string>; searching: boolean; pathOf: (id: string) => string
    onRow: (a: DocumentAsset, e: React.MouseEvent) => void; onTick: (id: string) => void
    onMenu: (e: React.MouseEvent, a: DocumentAsset) => void
}) {
    const COLS = '30px minmax(0,1.6fr) 120px 90px 100px 34px'
    return (
        <div style={{ border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
            <div className="desk-mono" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '9px 14px', fontSize: '0.6rem', letterSpacing: '0.08em', color: 'var(--ink-3)', background: 'var(--paper-tint)', borderBottom: '1px solid var(--hairline)' }}>
                <span /><span>FILE</span><span>STATUS</span><span>LENGTH</span><span>SIZE</span><span />
            </div>
            {items.map(a => {
                const on = sel.has(a.id)
                const Icon = iconFor(a.mediaKind)
                return (
                    <div
                        key={a.id}
                        onClick={e => onRow(a, e)}
                        onContextMenu={e => onMenu(e, a)}
                        style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer', background: on ? 'var(--accent-tint)' : 'transparent' }}
                    >
                        <Tick on={on} onClick={() => onTick(a.id)} title={on ? 'Deselect' : 'Select'} />
                        <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Icon size={15} style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
                            <span style={{ minWidth: 0 }}>
                                <p className="desk-truncate" style={{ margin: 0, fontSize: '0.84rem', fontWeight: 600 }}>{a.title}</p>
                                <p className="desk-truncate desk-mono" style={{ margin: '2px 0 0', fontSize: '0.56rem', color: 'var(--ink-3)' }}>
                                    {searching ? `IN ${pathOf(a.folderId).toUpperCase()}` : a.currentVersion.fileName}
                                </p>
                            </span>
                        </span>
                        <span>{a.statusLabel ? <StatusPill status={a.statusLabel} /> : <span style={{ color: 'var(--ink-3)' }}>—</span>}</span>
                        <span className="desk-mono" style={{ fontSize: '0.66rem', color: 'var(--ink-3)' }}>{fmtDur(a.currentVersion.durationMs) || '—'}</span>
                        <span className="desk-mono" style={{ fontSize: '0.66rem', color: 'var(--ink-3)' }}>{fmtBytes(a.currentVersion.sizeBytes)}</span>
                        <button onClick={e => onMenu(e, a)} aria-label={`More actions for ${a.title}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', justifyContent: 'center' }}>
                            <MoreHorizontal size={15} />
                        </button>
                    </div>
                )
            })}
        </div>
    )
}

function DetailSheet({ a, path, onClose, onDownload }: {
    a: DocumentAsset; path: string; onClose: () => void; onDownload: () => void
}) {
    const v = a.currentVersion
    const rows: [string, string][] = [
        ['File name', v.fileName],
        ['Folder', path || '—'],
        ['Size', fmtBytes(v.sizeBytes)],
        ['Length', fmtDur(v.durationMs) || '—'],
        ['Dimensions', v.width && v.height ? `${v.width} × ${v.height}` : '—'],
        ['Delivered', fmtDate(a.createdAt, true)],
        ['Production', a.clientName || '—'],
        ['Period', a.workspaceName || '—'],
    ]
    return (
        <Sheet onClose={onClose} width={460} label={a.title}>
            <SheetHeader title={a.title} kicker="File details" onClose={onClose} />
            <div style={{ padding: '4px 26px 26px' }}>
                {a.statusLabel && <div style={{ marginBottom: 16 }}><StatusPill status={a.statusLabel} /></div>}
                <dl style={{ margin: 0 }}>
                    {rows.map(([k, val]) => (
                        <div key={k} style={{ display: 'flex', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--hairline)' }}>
                            <dt className="desk-mono" style={{ flex: '0 0 116px', fontSize: '0.62rem', letterSpacing: '0.07em', color: 'var(--ink-3)', textTransform: 'uppercase' }}>{k}</dt>
                            <dd style={{ margin: 0, fontSize: '0.85rem', minWidth: 0, wordBreak: 'break-word' }}>{val}</dd>
                        </div>
                    ))}
                </dl>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    <Button variant="primary" size="sm" onClick={onDownload}><Download size={13} style={{ marginRight: 6 }} /> Download</Button>
                    {a.reviewUrl && a.mediaKind === 'video' && (
                        <a href={a.reviewUrl} target="_blank" rel="noopener noreferrer" className="desk-btn desk-btn--sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                            <Play size={13} /> Watch
                        </a>
                    )}
                </div>
            </div>
        </Sheet>
    )
}
