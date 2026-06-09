'use client'

/**
 * [Velox v4 — Multi-Hook Map Editor]
 *
 * Wraps the read-only `<VeloxMultiHookMap>` with the read-write layer
 * needed by Add Task / Task detail:
 *
 *   1. Folder URL input → POST /api/integrations/scan-folder?v=4
 *   2. Auto / Manual mode toggle (Manual dumps all files to Unsorted so
 *      the operator places them by hand)
 *   3. Click-to-move popover — click a node or a tray file to pick a
 *      destination. Tray files can become CTA / BODY / SCRIPT etc.; node
 *      files can be sent back to the Unsorted / Raw tray.
 *   4. Bubbles the edited `VeloxScanResult` to the parent via `onChange`
 *      so AddTaskModal can persist it on submit.
 *
 * Notes on the interaction model
 *   - True drag-and-drop is a stretch goal. Click-to-move is faster to
 *     implement, more accessible (works on tablets / keyboard nav), and
 *     it's the same mental model the v3 conflict dialog uses.
 *   - The editor never mutates the input `initialMap` — every change
 *     produces a new immutable copy.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
    Eye,
    Loader2,
    MousePointer2,
    RefreshCcw,
    Wand2,
    X,
} from 'lucide-react'
import VeloxMultiHookMap from './VeloxMultiHookMap'
import type {
    VeloxFile,
    VeloxNode,
    VeloxScanResult,
} from '@/lib/velox/v4-types'

// ────────────────────────────────────────────────────────────────────────────
//  Props
// ────────────────────────────────────────────────────────────────────────────

export interface VeloxMultiHookMapEditorProps {
    workspaceId: string
    /** Pre-filled folder URL — useful when re-opening a saved map. */
    initialFolderUrl?: string
    /** Pre-loaded VeloxScanResult — set when editing a saved row. */
    initialMap?: VeloxScanResult
    /** Bubbles the edited map (debounced 80ms) so parents can persist it
     *  on form-submit. */
    onChange?: (map: VeloxScanResult) => void
}

type EditMode = 'auto' | 'manual'

// ────────────────────────────────────────────────────────────────────────────
//  Editor
// ────────────────────────────────────────────────────────────────────────────

export default function VeloxMultiHookMapEditor({
    workspaceId,
    initialFolderUrl,
    initialMap,
    onChange,
}: VeloxMultiHookMapEditorProps) {
    const [folderUrl, setFolderUrl] = useState(initialFolderUrl ?? '')
    const [scanning, setScanning] = useState(false)
    const [scanError, setScanError] = useState<string | null>(null)
    const [map, setMap] = useState<VeloxScanResult | null>(initialMap ?? null)
    const [mode, setMode] = useState<EditMode>('auto')
    const [movePopover, setMovePopover] = useState<MovePopoverState | null>(null)

    // Debounced bubble — drag-style mutations would call this many times
    // per second, but click-to-move is one-shot. Still keep the debounce
    // so a quick double-click doesn't double-write the parent form.
    const changeRef = useRef(onChange)
    changeRef.current = onChange
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const bubbleChange = useCallback((next: VeloxScanResult) => {
        setMap(next)
        if (timeoutRef.current) clearTimeout(timeoutRef.current)
        const cb = changeRef.current
        if (!cb) return
        timeoutRef.current = setTimeout(() => cb(next), 80)
    }, [])

    // ─ Scan ─────────────────────────────────────────────────────────────
    const runScan = useCallback(async () => {
        if (!folderUrl.trim()) {
            setScanError('Hãy dán link folder Dropbox hoặc Google Drive.')
            return
        }
        setScanning(true)
        setScanError(null)
        try {
            const res = await fetch('/api/integrations/scan-folder?v=4', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ url: folderUrl.trim(), workspaceId }),
            })
            const body = await res.json()
            if (!res.ok) {
                setScanError(body?.error || `HTTP ${res.status}`)
                return
            }
            // Strip route-added fields so the shape stays VeloxScanResult.
            const { provider: _p, apiVersion: _v, ...result } = body
            bubbleChange(result as VeloxScanResult)
        } catch (e: any) {
            setScanError(e?.message ?? 'Lỗi không xác định.')
        } finally {
            setScanning(false)
        }
    }, [folderUrl, workspaceId, bubbleChange])

    // ─ Mode toggle ──────────────────────────────────────────────────────
    const switchMode = useCallback((next: EditMode) => {
        setMode(next)
        if (next === 'manual' && map) {
            const cleared: VeloxScanResult = {
                ...map,
                concepts: map.concepts.map(c => ({
                    ...c,
                    nodes: [],
                    finals: [],
                    edges: [],
                })),
                sharedAssets: [],
                trays: {
                    raw: map.trays.raw,
                    unsorted: [
                        ...collectMappedFiles(map),
                        ...map.trays.unsorted,
                    ],
                },
                stats: {
                    ...map.stats,
                    mappedFiles: 0,
                    unsortedFiles: map.trays.unsorted.length + map.stats.mappedFiles,
                    conceptsDetected: 0,
                    hooksDetected: 0,
                },
            }
            bubbleChange(cleared)
        }
    }, [map, bubbleChange])

    // ─ Click handlers passed to read-only map ───────────────────────────
    const onNodeOpen = useCallback((node: VeloxNode) => {
        if (!map) return
        setMovePopover({
            mode: 'node',
            node,
            file: node.files[0] ?? null,
        })
    }, [map])

    const onTrayFileClick = useCallback(
        (file: { name: string; url: string; path: string }) => {
            if (!map) return
            const veloxFile = findFile(map, file.path)
            if (!veloxFile) return
            const inUnsorted = map.trays.unsorted.some(f => f.path === file.path)
            setMovePopover({
                mode: 'tray',
                file: veloxFile,
                sourceTray: inUnsorted ? 'unsorted' : 'raw',
            })
        },
        [map],
    )

    const closePopover = useCallback(() => setMovePopover(null), [])

    const onPickDestination = useCallback(
        (dest: MoveDestination) => {
            if (!map || !movePopover) return
            const next = applyMove(map, movePopover, dest)
            setMovePopover(null)
            if (next) bubbleChange(next)
        },
        [map, movePopover, bubbleChange],
    )

    // ─ Derived: candidate destination nodes for the popover ─────────────
    const allNodeOptions = useMemo(() => {
        if (!map) return []
        const out: Array<{ id: string; label: string; role: string }> = []
        for (const c of map.concepts) {
            for (const n of [...c.nodes, ...c.finals]) {
                out.push({ id: n.id, label: `${c.label} · ${n.label}`, role: n.role })
            }
        }
        for (const n of map.sharedAssets) {
            out.push({ id: n.id, label: `Shared · ${n.label}`, role: n.role })
        }
        return out
    }, [map])

    // ─ Render ───────────────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            <ScanBar
                folderUrl={folderUrl}
                onChangeFolderUrl={setFolderUrl}
                onScan={runScan}
                scanning={scanning}
                hasMap={!!map}
                onReScan={() => {
                    setMap(null)
                    runScan()
                }}
            />

            {scanError && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-[12.5px] text-red-200">
                    {scanError}
                </div>
            )}

            {map && (
                <>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                        <ModeToggle mode={mode} onChange={switchMode} />
                        <p className="text-[11px] text-zinc-500 italic">
                            Bấm vào node hoặc file để mở menu "Chuyển đến…".
                        </p>
                    </div>
                    <VeloxMultiHookMap
                        result={map}
                        onNodeOpen={onNodeOpen}
                        onTrayFileClick={onTrayFileClick}
                    />
                </>
            )}

            {movePopover && map && (
                <MovePopoverOverlay
                    state={movePopover}
                    nodeOptions={allNodeOptions}
                    onClose={closePopover}
                    onPick={onPickDestination}
                />
            )}
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  ScanBar — folder URL + scan trigger
// ────────────────────────────────────────────────────────────────────────────

function ScanBar({
    folderUrl,
    onChangeFolderUrl,
    onScan,
    scanning,
    hasMap,
    onReScan,
}: {
    folderUrl: string
    onChangeFolderUrl: (v: string) => void
    onScan: () => void
    scanning: boolean
    hasMap: boolean
    onReScan: () => void
}) {
    return (
        <div className="bg-zinc-950/60 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-lg shadow-black/40">
            <label className="text-[11px] tracking-[0.16em] uppercase font-mono text-zinc-500 block mb-2">
                Folder Dropbox / Google Drive
            </label>
            <div className="flex flex-col md:flex-row gap-2">
                <input
                    type="url"
                    value={folderUrl}
                    onChange={(e) => onChangeFolderUrl(e.target.value)}
                    placeholder="https://www.dropbox.com/scl/fo/…"
                    className="flex-1 bg-zinc-900/50 border border-white/10 rounded-xl px-4 py-3 text-[13px] text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all"
                />
                {!hasMap ? (
                    <button
                        type="button"
                        onClick={onScan}
                        disabled={scanning}
                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white text-[13px] font-bold shadow-lg shadow-violet-500/30 transition-all disabled:opacity-60 disabled:cursor-wait"
                    >
                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        Quét bằng Velox
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onReScan}
                        disabled={scanning}
                        className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-zinc-300 text-[12.5px] font-semibold transition-colors disabled:opacity-60"
                    >
                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                        Quét lại
                    </button>
                )}
            </div>
        </div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Mode toggle
// ────────────────────────────────────────────────────────────────────────────

function ModeToggle({ mode, onChange }: { mode: EditMode; onChange: (m: EditMode) => void }) {
    return (
        <div className="inline-flex items-center gap-0 rounded-full p-1 border border-white/10 bg-zinc-900/40">
            <ModeBtn current={mode} value="auto" onClick={() => onChange('auto')}>
                <Eye className="w-3.5 h-3.5" /> Auto đặt sẵn
            </ModeBtn>
            <ModeBtn current={mode} value="manual" onClick={() => onChange('manual')}>
                <MousePointer2 className="w-3.5 h-3.5" /> Tự kéo thả
            </ModeBtn>
        </div>
    )
}

function ModeBtn({
    current, value, onClick, children,
}: {
    current: EditMode; value: EditMode; onClick: () => void; children: React.ReactNode
}) {
    const active = current === value
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors',
                active
                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-md shadow-violet-500/30'
                    : 'text-zinc-400 hover:text-white',
            ].join(' ')}
        >
            {children}
        </button>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Move popover
// ────────────────────────────────────────────────────────────────────────────

type MovePopoverState =
    | {
        mode: 'node'
        node: VeloxNode
        file: VeloxFile | null
    }
    | {
        mode: 'tray'
        file: VeloxFile
        sourceTray: 'raw' | 'unsorted'
    }

type MoveDestination =
    | { kind: 'node'; nodeId: string }
    | { kind: 'tray'; tray: 'raw' | 'unsorted' }
    | { kind: 'open-source' }   // open the file in Dropbox/Drive (escape hatch)

function MovePopoverOverlay({
    state,
    nodeOptions,
    onClose,
    onPick,
}: {
    state: MovePopoverState
    nodeOptions: Array<{ id: string; label: string; role: string }>
    onClose: () => void
    onPick: (dest: MoveDestination) => void
}) {
    const fileName =
        state.mode === 'node'
            ? (state.file?.name ?? state.node.label)
            : state.file.name
    const fileUrl = state.mode === 'node' ? state.file?.url : state.file.url

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="w-full max-w-md bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl shadow-violet-500/10 p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                        <div className="text-[10px] tracking-[0.16em] uppercase font-mono text-zinc-500">
                            Chuyển đến…
                        </div>
                        <div className="text-[14px] font-bold text-white truncate mt-0.5" title={fileName}>
                            {fileName}
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
                        aria-label="Đóng"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {/* Lane: nodes */}
                    {nodeOptions.length > 0 && (
                        <>
                            <SectionLabel>Node trên bản đồ</SectionLabel>
                            {nodeOptions.map((n) => (
                                <PickRow
                                    key={n.id}
                                    label={n.label}
                                    hint={n.role}
                                    onClick={() => onPick({ kind: 'node', nodeId: n.id })}
                                />
                            ))}
                        </>
                    )}

                    {/* Lane: trays */}
                    <SectionLabel>Khay</SectionLabel>
                    <PickRow
                        label="⚪ Chưa phân loại"
                        hint="Unsorted"
                        onClick={() => onPick({ kind: 'tray', tray: 'unsorted' })}
                    />
                    <PickRow
                        label="🗂 Raw / Chưa cắt"
                        hint="Raw tray"
                        onClick={() => onPick({ kind: 'tray', tray: 'raw' })}
                    />

                    {/* Escape — open the file URL */}
                    {fileUrl && (
                        <>
                            <SectionLabel>Hành động khác</SectionLabel>
                            <a
                                href={fileUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={onClose}
                                className="block w-full text-left px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/15 transition-colors text-[12.5px] text-violet-300"
                            >
                                ↗ Mở file gốc trên cloud
                            </a>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <div className="text-[10px] tracking-[0.16em] uppercase font-mono text-zinc-600 px-1 pt-2 pb-1">
            {children}
        </div>
    )
}

function PickRow({
    label,
    hint,
    onClick,
}: {
    label: string
    hint?: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-violet-500/40 transition-colors text-left"
        >
            <span className="text-[12.5px] text-zinc-200 truncate">{label}</span>
            {hint && (
                <span className="text-[10px] font-mono text-zinc-500 flex-none">{hint}</span>
            )}
        </button>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Map mutations
// ────────────────────────────────────────────────────────────────────────────

function applyMove(
    map: VeloxScanResult,
    state: MovePopoverState,
    dest: MoveDestination,
): VeloxScanResult | null {
    if (dest.kind === 'open-source') return null

    let file: VeloxFile
    let sourceNodeId: string | null = null
    let sourceTray: 'raw' | 'unsorted' | null = null

    if (state.mode === 'node') {
        if (!state.file) return null
        file = state.file
        sourceNodeId = state.node.id
    } else {
        file = state.file
        sourceTray = state.sourceTray
    }

    // Build immutable copies of the slices we touch.
    const next: VeloxScanResult = {
        ...map,
        concepts: map.concepts.map(c => ({
            ...c,
            nodes: c.nodes.map(n => ({ ...n, files: [...n.files] })),
            finals: c.finals.map(n => ({ ...n, files: [...n.files] })),
        })),
        sharedAssets: map.sharedAssets.map(n => ({ ...n, files: [...n.files] })),
        trays: {
            raw: [...map.trays.raw],
            unsorted: [...map.trays.unsorted],
        },
        stats: { ...map.stats },
    }

    // Remove from source
    if (sourceNodeId) removeFileFromNode(next, sourceNodeId, file.path)
    if (sourceTray === 'raw') next.trays.raw = next.trays.raw.filter(f => f.path !== file.path)
    if (sourceTray === 'unsorted') next.trays.unsorted = next.trays.unsorted.filter(f => f.path !== file.path)

    // Add to target
    if (dest.kind === 'tray') {
        const target = dest.tray === 'raw' ? next.trays.raw : next.trays.unsorted
        const placed = dest.tray === 'raw'
            ? { ...file, rawReason: 'thao tác thủ công · gửi về Raw tray' }
            : { ...file, rawReason: undefined }
        if (!target.some(f => f.path === file.path)) target.push(placed)
    } else if (dest.kind === 'node') {
        const targetNode = findNode(next, dest.nodeId)
        if (targetNode && !targetNode.files.some(f => f.path === file.path)) {
            targetNode.files.push(file)
        }
    }

    // [Review BLOCKER 2] Prune any node that just lost its last file.
    // Zod's `veloxNodeSchema.files.min(1)` would otherwise reject the map at
    // save time and the operator would silently lose their edits.
    pruneEmptyNodes(next)

    recomputeStats(next)
    return next
}

function pruneEmptyNodes(map: VeloxScanResult): void {
    // 1. Drop empty concept + shared nodes first.
    for (const c of map.concepts) {
        c.nodes = c.nodes.filter(n => n.files.length > 0)
        c.finals = c.finals.filter(n => n.files.length > 0)
    }
    map.sharedAssets = map.sharedAssets.filter(n => n.files.length > 0)

    // 2. Build the global live-id set AFTER pruning so edges to shared
    //    nodes that survived stay valid, and orphan edges (to dropped
    //    shared or concept nodes) get filtered out.
    const liveIds = new Set<string>()
    for (const c of map.concepts) {
        for (const n of c.nodes) liveIds.add(n.id)
        for (const n of c.finals) liveIds.add(n.id)
    }
    for (const n of map.sharedAssets) liveIds.add(n.id)

    for (const c of map.concepts) {
        c.edges = c.edges.filter(e => liveIds.has(e.from) && liveIds.has(e.to))
    }
}

function removeFileFromNode(map: VeloxScanResult, nodeId: string, path: string) {
    for (const c of map.concepts) {
        for (const n of [...c.nodes, ...c.finals]) {
            if (n.id !== nodeId) continue
            n.files = n.files.filter(f => f.path !== path)
        }
    }
    for (const n of map.sharedAssets) {
        if (n.id !== nodeId) continue
        n.files = n.files.filter(f => f.path !== path)
    }
}

function findNode(map: VeloxScanResult, nodeId: string): VeloxNode | undefined {
    for (const c of map.concepts) {
        for (const n of c.nodes) if (n.id === nodeId) return n
        for (const n of c.finals) if (n.id === nodeId) return n
    }
    return map.sharedAssets.find(n => n.id === nodeId)
}

function findFile(map: VeloxScanResult, path: string): VeloxFile | undefined {
    for (const c of map.concepts) {
        for (const n of [...c.nodes, ...c.finals]) {
            const f = n.files.find(f => f.path === path)
            if (f) return f
        }
    }
    for (const n of map.sharedAssets) {
        const f = n.files.find(f => f.path === path)
        if (f) return f
    }
    return (
        map.trays.unsorted.find(f => f.path === path) ??
        map.trays.raw.find(f => f.path === path)
    )
}

function collectMappedFiles(map: VeloxScanResult): VeloxFile[] {
    const all: VeloxFile[] = []
    for (const c of map.concepts) {
        for (const n of c.nodes) all.push(...n.files)
        for (const n of c.finals) all.push(...n.files)
    }
    for (const n of map.sharedAssets) all.push(...n.files)
    return all
}

function recomputeStats(map: VeloxScanResult): void {
    let mapped = 0
    let hooks = 0
    for (const c of map.concepts) {
        for (const n of c.nodes) {
            mapped += n.files.length
            if (n.role === 'HOOK') hooks += n.files.length
        }
        for (const n of c.finals) mapped += n.files.length
    }
    for (const n of map.sharedAssets) {
        mapped += n.files.length
        if (n.role === 'HOOK') hooks += n.files.length
    }
    map.stats.mappedFiles = mapped
    map.stats.hooksDetected = hooks
    map.stats.rawFiles = map.trays.raw.length
    map.stats.unsortedFiles = map.trays.unsorted.length
}
