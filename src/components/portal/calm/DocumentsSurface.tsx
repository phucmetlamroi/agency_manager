'use client'

import { useEffect, useMemo, useState } from 'react'
import {
    AlertTriangle,
    Check,
    ChevronDown,
    ChevronRight,
    Download,
    FileImage,
    FileVideo2,
    Folder,
    FolderOpen,
    Grid2X2,
    HardDrive,
    Layers,
    List,
    Loader2,
    MessageSquare,
    Search,
} from 'lucide-react'
import type { DeliverableActions, DocumentAsset, DocumentFolder, DocumentsSnapshot } from './types'

type Layout = 'grid' | 'list'

const VIOLET = '#8B5CF6'

function bytesLabel(raw: string | number): string {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let value = n
    let i = 0
    while (value >= 1024 && i < units.length - 1) {
        value /= 1024
        i += 1
    }
    return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

function durationLabel(ms: number | null): string | null {
    if (!ms || ms <= 0) return null
    const sec = Math.floor(ms / 1000)
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return h > 0
        ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        : `${m}:${String(s).padStart(2, '0')}`
}

function shortDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(iso))
    } catch {
        return '-'
    }
}

function triggerDownload(url: string, fileName: string): void {
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function assetKey(id: string): string {
    return `asset:${id}`
}

function folderKey(id: string): string {
    return `folder:${id}`
}

function isDescendant(folderById: Map<string, DocumentFolder>, childFolderId: string, parentFolderId: string): boolean {
    let cur: string | null = childFolderId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
        if (cur === parentFolderId) return true
        seen.add(cur)
        cur = folderById.get(cur)?.parentId ?? null
    }
    return false
}

function collectAncestorIds(folderById: Map<string, DocumentFolder>, folderId: string): string[] {
    const out: string[] = []
    let cur: string | null = folderId
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
        seen.add(cur)
        out.push(cur)
        cur = folderById.get(cur)?.parentId ?? null
    }
    return out
}

function SelectionCheck({ checked }: { checked: boolean }) {
    return (
        <span
            style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: checked ? `1px solid ${VIOLET}` : '1px solid rgba(255,255,255,0.18)',
                background: checked ? VIOLET : 'rgba(0,0,0,0.46)',
                color: checked ? '#fff' : 'transparent',
                boxShadow: checked ? '0 0 0 3px rgba(139,92,246,0.18)' : 'none',
            }}
        >
            <Check size={13} strokeWidth={3} />
        </span>
    )
}

function FolderTile({ folder, selected, onToggle, onOpen }: {
    folder: DocumentFolder
    selected: boolean
    onToggle: () => void
    onOpen: () => void
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            onDoubleClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
            style={{
                minHeight: 78,
                borderRadius: 8,
                border: selected ? `1px solid ${VIOLET}` : '1px solid rgba(255,255,255,0.10)',
                background: selected ? '#181321' : '#15151B',
                boxShadow: '0 10px 28px rgba(0,0,0,0.20)',
                padding: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                position: 'relative',
            }}
        >
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle() }}
                aria-label={selected ? 'Unselect folder' : 'Select folder'}
                style={{ position: 'absolute', top: 10, left: 10, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
            >
                <SelectionCheck checked={selected} />
            </button>
            <div
                style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: '#211A31',
                    border: '1px solid rgba(139,92,246,0.22)',
                    color: '#C4B5FD',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginLeft: 18,
                }}
            >
                <Folder size={21} />
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#F4F4F5', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{folder.name}</div>
                <div style={{ marginTop: 4, color: '#71717A', fontSize: 11, fontWeight: 600 }}>{folder.itemCount} items - {bytesLabel(folder.totalBytes)}</div>
            </div>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpen() }}
                aria-label="Open folder"
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)', color: '#A78BFA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
                <ChevronRight size={16} />
            </button>
        </div>
    )
}

function AssetTile({ asset, selected, layout, onToggle, onOpen }: {
    asset: DocumentAsset
    selected: boolean
    layout: Layout
    onToggle: () => void
    onOpen: () => void
}) {
    const Icon = asset.mediaKind === 'video' ? FileVideo2 : FileImage
    const duration = durationLabel(asset.currentVersion.durationMs)
    if (layout === 'list') {
        return (
            <div
                role="button"
                tabIndex={0}
                onDoubleClick={onOpen}
                onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
                style={{
                    display: 'grid',
                    gridTemplateColumns: '36px minmax(180px, 1.4fr) minmax(110px, .55fr) minmax(90px, .45fr) 90px',
                    gap: 12,
                    alignItems: 'center',
                    minHeight: 58,
                    borderRadius: 8,
                    padding: '0 12px',
                    border: selected ? `1px solid ${VIOLET}` : '1px solid rgba(255,255,255,0.09)',
                    background: selected ? '#181321' : '#111116',
                    color: '#E4E4E7',
                    cursor: 'pointer',
                }}
            >
                <button type="button" onClick={(e) => { e.stopPropagation(); onToggle() }} aria-label={selected ? 'Unselect asset' : 'Select asset'} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
                    <SelectionCheck checked={selected} />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: '#18181F', color: '#A78BFA', border: '1px solid rgba(255,255,255,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={17} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.title}</div>
                        <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{asset.workspaceName || 'Project'} - v{asset.currentVersion.versionNumber}</div>
                    </div>
                </div>
                <span style={{ fontSize: 12, color: '#A1A1AA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.clientName || '-'}</span>
                <span style={{ fontSize: 12, color: '#A1A1AA' }}>{duration || '-'}</span>
                <span style={{ fontSize: 12, color: '#A1A1AA', textAlign: 'right' }}>{bytesLabel(asset.currentVersion.sizeBytes)}</span>
            </div>
        )
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onDoubleClick={onOpen}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
            style={{
                borderRadius: 8,
                border: selected ? `1px solid ${VIOLET}` : '1px solid rgba(255,255,255,0.10)',
                background: selected ? '#181321' : '#141419',
                boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
            }}
        >
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggle() }}
                aria-label={selected ? 'Unselect asset' : 'Select asset'}
                style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}
            >
                <SelectionCheck checked={selected} />
            </button>
            <div style={{ aspectRatio: '16 / 9', background: '#050507', borderBottom: '1px solid rgba(255,255,255,0.08)', position: 'relative', overflow: 'hidden' }}>
                {asset.currentVersion.posterUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={asset.currentVersion.posterUrl} alt={asset.title} loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                ) : (
                    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#52525B' }}>
                        <Icon size={30} />
                    </div>
                )}
                {duration && (
                    <span style={{ position: 'absolute', right: 8, bottom: 8, borderRadius: 6, background: 'rgba(0,0,0,0.72)', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 6px' }}>{duration}</span>
                )}
                {asset.versionCount > 1 && (
                    <span style={{ position: 'absolute', right: 8, top: 8, display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 6, background: 'rgba(0,0,0,0.72)', color: '#DDD6FE', fontSize: 11, fontWeight: 800, padding: '3px 6px' }}>
                        <Layers size={12} /> v{asset.currentVersion.versionNumber}
                    </span>
                )}
            </div>
            <div style={{ minHeight: 76, padding: 12 }}>
                <div style={{ color: '#F4F4F5', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{asset.title}</div>
                <div style={{ marginTop: 4, color: '#71717A', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {asset.clientName || asset.workspaceName || 'Document'} - {shortDate(asset.currentVersion.createdAt)}
                </div>
                <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: '#A1A1AA', fontSize: 11, fontWeight: 700 }}>{bytesLabel(asset.currentVersion.sizeBytes)}</span>
                    {asset.currentVersion.publicCommentCount > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#A1A1AA', fontSize: 11, fontWeight: 700 }}>
                            <MessageSquare size={12} /> {asset.currentVersion.publicCommentCount}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

function TreeNode({ folder, folderByParent, currentId, expanded, onToggle, onOpen, depth = 0 }: {
    folder: DocumentFolder
    folderByParent: Map<string | null, DocumentFolder[]>
    currentId: string | null
    expanded: Set<string>
    onToggle: (id: string) => void
    onOpen: (id: string | null) => void
    depth?: number
}) {
    const children = folderByParent.get(folder.id) ?? []
    const open = expanded.has(folder.id)
    const active = currentId === folder.id
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 4 + depth * 12 }}>
                {children.length ? (
                    <button type="button" onClick={() => onToggle(folder.id)} aria-label={open ? 'Collapse' : 'Expand'} style={{ width: 22, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 0, background: 'transparent', color: '#71717A', cursor: 'pointer' }}>
                        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                ) : <span style={{ width: 22 }} />}
                <button
                    type="button"
                    onClick={() => onOpen(folder.id)}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        height: 30,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        border: active ? `1px solid rgba(139,92,246,0.22)` : '1px solid transparent',
                        background: active ? 'rgba(139,92,246,0.16)' : 'transparent',
                        color: active ? '#DDD6FE' : '#A1A1AA',
                        borderRadius: 7,
                        padding: '0 8px',
                        cursor: 'pointer',
                        textAlign: 'left',
                    }}
                    title={folder.name}
                >
                    {active ? <FolderOpen size={14} /> : <Folder size={14} />}
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12.5, fontWeight: active ? 800 : 650 }}>{folder.name}</span>
                </button>
            </div>
            {open && children.length > 0 && children.map((child) => (
                <TreeNode key={child.id} folder={child} folderByParent={folderByParent} currentId={currentId} expanded={expanded} onToggle={onToggle} onOpen={onOpen} depth={depth + 1} />
            ))}
        </div>
    )
}

export default function DocumentsSurface({ actions, wsScope, scope }: {
    actions: DeliverableActions
    wsScope: string | 'all'
    scope: number | 'all'
}) {
    const [documents, setDocuments] = useState<DocumentsSnapshot | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [layout, setLayout] = useState<Layout>('grid')
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [downloading, setDownloading] = useState(false)
    const [downloadMessage, setDownloadMessage] = useState<string | null>(null)

    useEffect(() => {
        let alive = true
        const load = async () => {
            try {
                const snapshot = await Promise.resolve(actions.documents ? actions.documents() : null)
                if (!alive) return
                setDocuments(snapshot)
                const rootIds = snapshot?.folders.filter((f) => f.parentId === null).map((f) => f.id) ?? []
                setExpanded(new Set(rootIds))
                setError(null)
            } catch {
                if (alive) setError('Could not load documents.')
            } finally {
                if (alive) setLoading(false)
            }
        }
        void load()
        return () => { alive = false }
    }, [actions])

    const folderById = useMemo(() => new Map((documents?.folders ?? []).map((f) => [f.id, f])), [documents])

    const visible = useMemo(() => {
        const allAssets = documents?.assets ?? []
        const allFolders = documents?.folders ?? []
        const q = query.trim().toLowerCase()
        const scopedAssets = allAssets.filter((asset) => {
            if (wsScope !== 'all' && asset.workspaceId !== wsScope) return false
            if (scope !== 'all' && asset.clientId !== scope) return false
            return true
        })
        const folderMatches = new Set(
            q
                ? allFolders.filter((folder) => folder.name.toLowerCase().includes(q)).map((folder) => folder.id)
                : [],
        )
        const assets = scopedAssets.filter((asset) => {
            if (!q) return true
            const text = [
                asset.title,
                asset.clientName,
                asset.workspaceName,
                asset.currentVersion.fileName,
                asset.statusLabel,
            ].filter(Boolean).join(' ').toLowerCase()
            if (text.includes(q)) return true
            return Array.from(folderMatches).some((folderId) => isDescendant(folderById, asset.folderId, folderId))
        })
        const folderIds = new Set<string>()
        for (const asset of assets) for (const id of collectAncestorIds(folderById, asset.folderId)) folderIds.add(id)
        for (const id of folderMatches) {
            const folder = folderById.get(id)
            if (!folder) continue
            if (wsScope !== 'all' && folder.workspaceId && folder.workspaceId !== wsScope) continue
            if (scope !== 'all' && folder.clientId != null && folder.clientId !== scope) continue
            for (const ancestorId of collectAncestorIds(folderById, id)) folderIds.add(ancestorId)
        }
        const folders = allFolders.filter((folder) => folderIds.has(folder.id))
        return { assets, folders }
    }, [documents, folderById, query, scope, wsScope])

    const folderByParent = useMemo(() => {
        const map = new Map<string | null, DocumentFolder[]>()
        for (const folder of visible.folders) {
            const parent = folder.parentId && folderById.has(folder.parentId) && visible.folders.some((f) => f.id === folder.parentId)
                ? folder.parentId
                : null
            const list = map.get(parent)
            if (list) list.push(folder)
            else map.set(parent, [folder])
        }
        for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name))
        return map
    }, [folderById, visible.folders])

    const activeFolderId = currentFolderId && visible.folders.some((folder) => folder.id === currentFolderId)
        ? currentFolderId
        : null
    const currentFolders = folderByParent.get(activeFolderId) ?? []
    const currentAssets = activeFolderId ? visible.assets.filter((asset) => asset.folderId === activeFolderId) : []
    const totalBytes = bytesLabel(visible.assets.reduce((sum, asset) => sum + Number(asset.currentVersion.sizeBytes), 0))
    const currentFolder = activeFolderId ? folderById.get(activeFolderId) ?? null : null
    const breadcrumb = useMemo(() => {
        if (!currentFolder) return []
        return collectAncestorIds(folderById, currentFolder.id)
            .reverse()
            .map((id) => folderById.get(id))
            .filter((folder): folder is DocumentFolder => !!folder && visible.folders.some((f) => f.id === folder.id))
    }, [currentFolder, folderById, visible.folders])

    const selectedVersionIds = useMemo(() => {
        const ids = new Set<string>()
        const selectedFolders = new Set<string>()
        for (const key of selected) {
            if (key.startsWith('asset:')) {
                const asset = visible.assets.find((item) => item.id === key.slice(6))
                if (asset) ids.add(asset.currentVersion.id)
            } else if (key.startsWith('folder:')) {
                selectedFolders.add(key.slice(7))
            }
        }
        if (selectedFolders.size) {
            for (const asset of visible.assets) {
                for (const folderId of selectedFolders) {
                    if (isDescendant(folderById, asset.folderId, folderId)) ids.add(asset.currentVersion.id)
                }
            }
        }
        return Array.from(ids)
    }, [folderById, selected, visible.assets])

    const toggle = (key: string) => setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
    })

    const downloadVersions = async (versionIds: string[]) => {
        if (!actions.downloadDocuments || versionIds.length === 0) return
        setDownloading(true)
        setDownloadMessage(null)
        const result = await actions.downloadDocuments(versionIds)
        if (!result.success || !result.files?.length) {
            setDownloadMessage(result.error || 'Could not start the download.')
            setDownloading(false)
            return
        }
        let done = 0
        for (const file of result.files) {
            triggerDownload(file.url, file.fileName)
            done += 1
            setDownloadMessage(`Downloading ${done}/${result.files.length}`)
            if (done < result.files.length) await sleep(280)
        }
        setDownloading(false)
        setDownloadMessage(`Started ${result.files.length} download${result.files.length === 1 ? '' : 's'}.`)
    }

    const downloadCurrentFolder = () => {
        const ids = activeFolderId
            ? visible.assets.filter((asset) => isDescendant(folderById, asset.folderId, activeFolderId)).map((asset) => asset.currentVersion.id)
            : visible.assets.map((asset) => asset.currentVersion.id)
        void downloadVersions(ids)
    }

    if (!actions.documents) {
        return (
            <div style={{ maxWidth: 1080, margin: '0 auto', padding: 28 }}>
                <div className="pc-card" style={{ padding: 28 }}>
                    <p style={{ margin: 0, color: 'var(--fg-2)' }}>Document is not available for this link.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="pc-view-in" style={{ padding: '24px', height: '100%', minHeight: 0 }}>
            <div style={{ margin: '0 auto', maxWidth: 1280, height: '100%', minHeight: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                    <div>
                        <p className="eyebrow" style={{ marginBottom: 5, color: VIOLET }}>Client document room</p>
                        <h1 style={{ margin: 0, fontSize: 25, fontWeight: 800, color: 'var(--fg)' }}>Document</h1>
                        <p style={{ margin: '5px 0 0', fontSize: 14, color: 'var(--fg-2)' }}>Browse approved project folders and download the original files in bulk.</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 11px', borderRadius: 999, background: '#15151B', color: '#D4D4D8', border: '1px solid rgba(255,255,255,0.10)', fontSize: 12, fontWeight: 700 }}>
                            <HardDrive size={14} style={{ color: '#A78BFA' }} /> {visible.assets.length} files - {totalBytes}
                        </span>
                        <button type="button" className="pc-btn pc-btn-quiet" onClick={downloadCurrentFolder} disabled={downloading || visible.assets.length === 0} style={{ height: 34 }}>
                            {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download all
                        </button>
                    </div>
                </div>

                <div style={{ flex: 1, minHeight: 0, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#07070A', boxShadow: '0 18px 50px rgba(0,0,0,0.22)' }}>
                    <div className="grid grid-cols-1 md:grid-cols-[260px_minmax(0,1fr)]" style={{ height: '100%', minHeight: 520 }}>
                        <aside className="hidden md:block" style={{ borderRight: '1px solid rgba(255,255,255,0.08)', background: '#0B0B10', padding: 14, overflow: 'auto' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px 12px', color: '#71717A', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.16em' }}>
                                <Layers size={13} style={{ color: '#A78BFA' }} /> Assets
                            </div>
                            <button
                                type="button"
                                onClick={() => setCurrentFolderId(null)}
                                style={{
                                    width: '100%',
                                    height: 34,
                                    borderRadius: 8,
                                    border: activeFolderId === null ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
                                    background: activeFolderId === null ? 'rgba(139,92,246,0.16)' : 'transparent',
                                    color: activeFolderId === null ? '#DDD6FE' : '#A1A1AA',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '0 10px',
                                    cursor: 'pointer',
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    marginBottom: 6,
                                }}
                            >
                                <FolderOpen size={14} /> All documents
                            </button>
                            {folderByParent.get(null)?.map((folder) => (
                                <TreeNode
                                    key={folder.id}
                                    folder={folder}
                                    folderByParent={folderByParent}
                                    currentId={activeFolderId}
                                    expanded={expanded}
                                    onToggle={(id) => setExpanded((prev) => {
                                        const next = new Set(prev)
                                        if (next.has(id)) next.delete(id)
                                        else next.add(id)
                                        return next
                                    })}
                                    onOpen={(id) => setCurrentFolderId(id)}
                                />
                            ))}
                        </aside>

                        <section style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
                            <div style={{ minHeight: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#0B0B10', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, color: '#A1A1AA', fontSize: 13, fontWeight: 700 }}>
                                    <button type="button" onClick={() => { setCurrentFolderId(null); setSelected(new Set()) }} style={{ border: 0, background: 'transparent', color: activeFolderId ? '#A78BFA' : '#F4F4F5', cursor: activeFolderId ? 'pointer' : 'default', fontWeight: 800 }}>Document</button>
                                    {breadcrumb.map((folder) => (
                                        <span key={folder.id} style={{ minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                            <ChevronRight size={13} style={{ color: '#52525B' }} />
                                            <button type="button" onClick={() => setCurrentFolderId(folder.id)} style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 0, background: 'transparent', color: folder.id === activeFolderId ? '#F4F4F5' : '#A78BFA', cursor: 'pointer', fontWeight: 800 }}>{folder.name}</button>
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <label style={{ width: 220, height: 34, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 9, background: '#15151B', border: '1px solid rgba(255,255,255,0.10)', color: '#71717A', padding: '0 10px' }}>
                                        <Search size={14} />
                                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" style={{ minWidth: 0, flex: 1, border: 0, outline: 0, background: 'transparent', color: '#E4E4E7', fontSize: 12.5 }} />
                                    </label>
                                    <span style={{ display: 'inline-flex', height: 34, borderRadius: 9, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.10)', background: '#15151B' }}>
                                        <button type="button" onClick={() => setLayout('grid')} aria-label="Grid view" style={{ width: 36, border: 0, background: layout === 'grid' ? 'rgba(139,92,246,0.20)' : 'transparent', color: layout === 'grid' ? '#DDD6FE' : '#A1A1AA', cursor: 'pointer' }}><Grid2X2 size={15} /></button>
                                        <button type="button" onClick={() => setLayout('list')} aria-label="List view" style={{ width: 36, border: 0, background: layout === 'list' ? 'rgba(139,92,246,0.20)' : 'transparent', color: layout === 'list' ? '#DDD6FE' : '#A1A1AA', cursor: 'pointer' }}><List size={15} /></button>
                                    </span>
                                </div>
                            </div>

                            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>
                                {loading ? (
                                    <div style={{ display: 'grid', placeItems: 'center', minHeight: 320, color: '#A1A1AA', gap: 10 }}>
                                        <Loader2 size={24} className="animate-spin" style={{ color: '#A78BFA' }} />
                                        <span style={{ fontSize: 13, fontWeight: 700 }}>Loading documents...</span>
                                    </div>
                                ) : error ? (
                                    <div style={{ display: 'grid', placeItems: 'center', minHeight: 320, color: '#A1A1AA', textAlign: 'center' }}>
                                        <div>
                                            <AlertTriangle size={28} style={{ color: '#FCA5A5', margin: '0 auto 10px' }} />
                                            <p style={{ margin: 0, fontSize: 13 }}>{error}</p>
                                        </div>
                                    </div>
                                ) : visible.assets.length === 0 && visible.folders.length === 0 ? (
                                    <div style={{ display: 'grid', placeItems: 'center', minHeight: 320, color: '#A1A1AA', textAlign: 'center' }}>
                                        <div>
                                            <FolderOpen size={34} style={{ color: '#A78BFA', margin: '0 auto 12px' }} />
                                            <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#E4E4E7' }}>No documents yet</p>
                                            <p style={{ margin: '4px auto 0', maxWidth: 360, fontSize: 12.5, color: '#71717A' }}>Files appear here after the team sends a review-ready version for your project.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
                                        {currentFolders.length > 0 && (
                                            <div>
                                                <div style={{ marginBottom: 10, color: '#A1A1AA', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.13em' }}>Folders - {currentFolders.length}</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                                                    {currentFolders.map((folder) => (
                                                        <FolderTile
                                                            key={folder.id}
                                                            folder={folder}
                                                            selected={selected.has(folderKey(folder.id))}
                                                            onToggle={() => toggle(folderKey(folder.id))}
                                                            onOpen={() => {
                                                                setCurrentFolderId(folder.id)
                                                                setExpanded((prev) => new Set(prev).add(folder.id))
                                                                setSelected(new Set())
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {currentAssets.length > 0 && (
                                            <div>
                                                <div style={{ marginBottom: 10, color: '#A1A1AA', fontSize: 10.5, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.13em' }}>Files - {currentAssets.length}</div>
                                                <div style={layout === 'grid'
                                                    ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }
                                                    : { display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                    {currentAssets.map((asset) => (
                                                        <AssetTile
                                                            key={asset.id}
                                                            asset={asset}
                                                            layout={layout}
                                                            selected={selected.has(assetKey(asset.id))}
                                                            onToggle={() => toggle(assetKey(asset.id))}
                                                            onOpen={() => {
                                                                if (asset.reviewUrl) window.open(asset.reviewUrl, '_blank', 'noopener,noreferrer')
                                                                else void downloadVersions([asset.currentVersion.id])
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {currentFolders.length === 0 && currentAssets.length === 0 && (
                                            <div style={{ display: 'grid', placeItems: 'center', minHeight: 260, color: '#71717A', textAlign: 'center' }}>
                                                <div>
                                                    <FolderOpen size={30} style={{ color: '#A78BFA', margin: '0 auto 10px' }} />
                                                    <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: '#D4D4D8' }}>This folder is empty in the current filter.</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {(selected.size > 0 || downloadMessage) && (
                                <div style={{ minHeight: 58, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)', background: '#0B0B10' }}>
                                    <div style={{ color: downloadMessage ? '#A1A1AA' : '#E4E4E7', fontSize: 12.5, fontWeight: 800 }}>
                                        {downloadMessage || `${selected.size} selected - ${selectedVersionIds.length} file${selectedVersionIds.length === 1 ? '' : 's'}`}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {selected.size > 0 && (
                                            <button type="button" onClick={() => setSelected(new Set())} style={{ height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: '#A1A1AA', cursor: 'pointer', fontSize: 12.5, fontWeight: 800 }}>Clear</button>
                                        )}
                                        {selected.size > 0 && (
                                            <button type="button" onClick={() => void downloadVersions(selectedVersionIds)} disabled={downloading || selectedVersionIds.length === 0} style={{ height: 34, padding: '0 14px', borderRadius: 9, border: '1px solid rgba(139,92,246,0.35)', background: VIOLET, color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                                                {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download selected
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </div>
        </div>
    )
}
