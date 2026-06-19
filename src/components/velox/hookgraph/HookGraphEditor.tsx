'use client'

/**
 * [Hook Graph — editor]  (P2 canvas · P3 blocks · P4 connections · P5 variants)
 *
 * A free-form node-graph whiteboard built on React Flow. The user creates,
 * names, drags, wires and links blocks by hand; Velox can optionally seed it.
 * Each root→leaf path = one video variant (live readout on the right).
 *
 * State model: nodes/edges are the controlled source of truth; a snapshot
 * history powers undo/redo; the graph + variant readout are derived. The parent
 * receives the serialised HookGraph via a debounced onChange.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    BackgroundVariant,
    Controls,
    Panel,
    ConnectionMode,
    addEdge,
    applyEdgeChanges,
    applyNodeChanges,
    useReactFlow,
    type Connection,
    type Edge,
    type EdgeChange,
    type NodeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toast } from 'sonner'

import {
    HOOK_GRAPH_SCHEMA_VERSION,
    createBlock,
    genId,
    type HookEdge,
    type HookGraph,
} from '@/lib/velox/hook-graph-types'
import {
    edgeKeysForPaths,
    enumeratePaths,
    pathIndicesThroughBlock,
    wouldCreateCycle,
} from '@/lib/velox/hook-graph-paths'
import { HookBlockNode, type HookNode } from './HookBlockNode'
import { HookVariantPanel } from './HookVariantPanel'
import { HookInspector } from './HookInspector'
import { TAG_PALETTE, rgba } from './hook-graph-style'
import './hookgraph.css'

// React Flow needs a STABLE nodeTypes reference.
const nodeTypes = { hookBlock: HookBlockNode }

// ── serialisation helpers ───────────────────────────────────────────────────

function blockToNode(b: HookGraph['blocks'][number]): HookNode {
    return {
        id: b.id,
        type: 'hookBlock',
        position: b.position,
        data: {
            name: b.name,
            url: b.url,
            timecode: b.timecode,
            tag: b.tag,
            status: b.status,
            note: b.note,
            durationSec: b.durationSec,
            assigneeId: b.assigneeId,
            thumbnailUrl: b.thumbnailUrl,
        },
    }
}

function edgeToRf(e: HookEdge): Edge {
    return { id: e.id, source: e.from, target: e.to }
}

function rfToGraph(nodes: HookNode[], edges: Edge[], viewport?: HookGraph['viewport']): HookGraph {
    return {
        schemaVersion: HOOK_GRAPH_SCHEMA_VERSION,
        blocks: nodes.map((n) => ({
            id: n.id,
            name: n.data.name,
            position: n.position,
            url: n.data.url,
            timecode: n.data.timecode,
            tag: n.data.tag,
            status: n.data.status,
            note: n.data.note,
            durationSec: n.data.durationSec,
            assigneeId: n.data.assigneeId ?? undefined,
            thumbnailUrl: n.data.thumbnailUrl,
        })),
        edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })),
        viewport,
    }
}

/** Layered left→right layout (depth = longest path from a root). */
function autoLayout(nodes: HookNode[], edges: Edge[]): Map<string, { x: number; y: number }> {
    const out = new Map<string, string[]>()
    const inDeg = new Map<string, number>()
    nodes.forEach((n) => {
        out.set(n.id, [])
        inDeg.set(n.id, 0)
    })
    edges.forEach((e) => {
        if (out.has(e.source) && inDeg.has(e.target)) {
            out.get(e.source)!.push(e.target)
            inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
        }
    })
    const depth = new Map<string, number>()
    const queue = nodes.filter((n) => (inDeg.get(n.id) ?? 0) === 0).map((n) => n.id)
    queue.forEach((id) => depth.set(id, 0))
    const work = [...queue]
    const indegWork = new Map(inDeg)
    let guard = 0
    while (work.length && guard++ < 10000) {
        const id = work.shift()!
        const d = depth.get(id) ?? 0
        for (const nx of out.get(id) ?? []) {
            depth.set(nx, Math.max(depth.get(nx) ?? 0, d + 1))
            indegWork.set(nx, (indegWork.get(nx) ?? 1) - 1)
            if ((indegWork.get(nx) ?? 0) === 0) work.push(nx)
        }
    }
    const byDepth = new Map<number, string[]>()
    nodes.forEach((n) => {
        const d = depth.get(n.id) ?? 0
        if (!byDepth.has(d)) byDepth.set(d, [])
        byDepth.get(d)!.push(n.id)
    })
    const pos = new Map<string, { x: number; y: number }>()
    byDepth.forEach((ids, d) => {
        ids.forEach((id, i) => pos.set(id, { x: d * 300, y: i * 150 }))
    })
    return pos
}

const srcUrl = (n: HookNode): string | null => {
    const u = n.data.url?.trim()
    if (u) return u
    const f = n.data.timecode?.fileUrl?.trim()
    return f || null
}

type Snap = { nodes: HookNode[]; edges: Edge[] }

export interface HookGraphEditorProps {
    initialGraph?: HookGraph | null
    onChange?: (graph: HookGraph) => void
    /** When provided, shows the "Đổ sẵn từ Velox" button. */
    onSeed?: () => Promise<HookGraph | null>
    /** When provided, shows a prominent "Lưu Multi-hook Map" button in the toolbar. */
    onSave?: () => void | Promise<void>
    saveLabel?: string
    height?: number
}

function ToolBtn({
    onClick,
    title,
    disabled,
    children,
    accent,
}: {
    onClick: () => void
    title: string
    disabled?: boolean
    children: React.ReactNode
    accent?: boolean
}) {
    return (
        <button
            type="button"
            title={title}
            disabled={disabled}
            onClick={onClick}
            className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                accent
                    ? 'bg-violet-500/90 text-white hover:bg-violet-500'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
            }`}
        >
            {children}
        </button>
    )
}

function Flow({
    initialGraph,
    onChange,
    onSeed,
    onSave,
    saveLabel = 'Save',
    height = 520,
}: HookGraphEditorProps) {
    const rf = useReactFlow<HookNode, Edge>()
    const wrapperRef = useRef<HTMLDivElement>(null)

    const [nodes, setNodes] = useState<HookNode[]>(() =>
        (initialGraph?.blocks ?? []).map(blockToNode),
    )
    const [edges, setEdges] = useState<Edge[]>(() => (initialGraph?.edges ?? []).map(edgeToRf))
    const [inspectId, setInspectId] = useState<string | null>(null)
    const [railTab, setRailTab] = useState<'variants' | 'inspect'>('variants')
    const [highlight, setHighlight] = useState<{ blocks: Set<string>; edges: Set<string> } | null>(
        null,
    )
    const [seeding, setSeeding] = useState(false)
    const [savingMap, setSavingMap] = useState(false)
    const [, forceUpdate] = useReducer((x) => x + 1, 0)

    const doSave = useCallback(async () => {
        if (!onSave) return
        setSavingMap(true)
        try {
            await onSave()
        } finally {
            setSavingMap(false)
        }
    }, [onSave])

    const nodesRef = useRef(nodes)
    nodesRef.current = nodes
    const edgesRef = useRef(edges)
    edgesRef.current = edges
    const past = useRef<Snap[]>([])
    const future = useRef<Snap[]>([])
    const lastCommitAt = useRef(0)

    const pushHistory = useCallback(() => {
        past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
        if (past.current.length > 80) past.current.shift()
        future.current = []
        forceUpdate()
    }, [])
    const pushHistoryThrottled = useCallback(() => {
        const now = Date.now()
        if (now - lastCommitAt.current > 600) {
            lastCommitAt.current = now
            pushHistory()
        }
    }, [pushHistory])
    const undo = useCallback(() => {
        const prev = past.current.pop()
        if (!prev) return
        future.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
        setNodes(prev.nodes)
        setEdges(prev.edges)
        forceUpdate()
    }, [])
    const redo = useCallback(() => {
        const next = future.current.pop()
        if (!next) return
        past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
        setNodes(next.nodes)
        setEdges(next.edges)
        forceUpdate()
    }, [])

    // derived graph + variant readout
    const graph = useMemo(() => rfToGraph(nodes, edges), [nodes, edges])
    const readout = useMemo(() => enumeratePaths(graph), [graph])

    // debounced bubble-up of the serialised graph
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    // Latest serialised graph, kept current every render so we can flush it on
    // unmount (below) — guards against losing a last-second edit.
    const latestGraphRef = useRef<HookGraph>(graph)
    latestGraphRef.current = graph
    useEffect(() => {
        const t = setTimeout(() => {
            let viewport: HookGraph['viewport']
            try {
                viewport = rf.getViewport()
            } catch {
                /* not mounted yet */
            }
            onChangeRef.current?.({ ...graph, viewport })
        }, 250)
        return () => clearTimeout(t)
    }, [graph, rf])
    // [DATA-LOSS FIX] When the editor unmounts (e.g. the user switches from the
    // Multi-Hook Map sub-tab to "Link lẻ"), the debounced timer above is cleared
    // before it fires — so an edit made in the last ~250ms would never reach the
    // parent's hookGraph and would be dropped on submit. Flush the final state
    // synchronously on unmount to close that window.
    useEffect(() => {
        return () => {
            onChangeRef.current?.(latestGraphRef.current)
        }
    }, [])

    // ── node callbacks (stable; functional updates avoid stale closures) ──────
    const onRename = useCallback(
        (id: string, name: string) => {
            pushHistory()
            setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, name } } : n)))
        },
        [pushHistory],
    )
    const onEdit = useCallback((id: string) => {
        setInspectId(id)
        setRailTab('inspect')
    }, [])
    const onDelete = useCallback(
        (id: string) => {
            pushHistory()
            setNodes((nds) => nds.filter((n) => n.id !== id))
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
            setInspectId((cur) => (cur === id ? null : cur))
        },
        [pushHistory],
    )
    const onOpen = useCallback(
        (id: string) => {
            const n = nodesRef.current.find((x) => x.id === id)
            if (!n) return
            const url = srcUrl(n)
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
            else {
                setInspectId(id)
                setRailTab('inspect')
            }
        },
        [],
    )

    // ── connections + DAG validation ──────────────────────────────────────────
    const isValidConnection = useCallback((c: Connection | Edge) => {
        const source = c.source
        const target = c.target
        if (!source || !target || source === target) return false
        if (edgesRef.current.some((e) => e.source === source && e.target === target)) return false
        if (wouldCreateCycle(rfToGraph(nodesRef.current, edgesRef.current), source, target))
            return false
        return true
    }, [])
    const onConnect = useCallback(
        (c: Connection) => {
            if (!isValidConnection(c)) {
                toast.error('Không nối được — sẽ tạo vòng lặp, hoặc dây đã tồn tại.')
                return
            }
            pushHistory()
            setEdges((eds) => addEdge({ ...c, id: genId('edge') }, eds))
        },
        [isValidConnection, pushHistory],
    )

    const onNodesChange = useCallback(
        (changes: NodeChange<HookNode>[]) => {
            if (changes.some((ch) => ch.type === 'remove')) pushHistory()
            setNodes((nds) => applyNodeChanges(changes, nds))
        },
        [pushHistory],
    )
    const onEdgesChange = useCallback(
        (changes: EdgeChange<Edge>[]) => {
            if (changes.some((ch) => ch.type === 'remove')) pushHistory()
            setEdges((eds) => applyEdgeChanges(changes, eds))
        },
        [pushHistory],
    )
    const onNodeDragStart = useCallback(() => pushHistory(), [pushHistory])

    // ── add / seed / auto-layout ─────────────────────────────────────────────
    // `screen` is an optional {x,y} in client coords (e.g. a double-click point);
    // when omitted we drop the block near the middle of the viewport.
    const addBlock = useCallback(
        (screen?: { x: number; y: number }) => {
            const rect = wrapperRef.current?.getBoundingClientRect()
            let p = { x: 0, y: 0 }
            try {
                const src =
                    screen ??
                    (rect
                        ? { x: rect.left + rect.width * 0.42, y: rect.top + rect.height * 0.42 }
                        : { x: 0, y: 0 })
                p = rf.screenToFlowPosition(src)
            } catch {
                /* ignore */
            }
            const blk = createBlock({ position: { x: Math.round(p.x), y: Math.round(p.y) } })
            pushHistory()
            setNodes((nds) => [...nds, blockToNode(blk)])
            setInspectId(blk.id)
            setRailTab('inspect')
        },
        [rf, pushHistory],
    )

    // ── multi-select bulk tag ────────────────────────────────────────────────
    // Selected node ids (React Flow tracks `selected` on each node). Shift+drag
    // a marquee or Shift+click to pick several, then one click tags them all.
    const selectedIds = useMemo(() => nodes.filter((n) => n.selected).map((n) => n.id), [nodes])
    const applyTagToSelected = useCallback(
        (tag: string) => {
            if (selectedIds.length === 0) return
            const sel = new Set(selectedIds)
            pushHistory()
            setNodes((nds) =>
                nds.map((n) => (sel.has(n.id) ? { ...n, data: { ...n.data, tag } } : n)),
            )
        },
        [selectedIds, pushHistory],
    )

    const doSeed = useCallback(async () => {
        if (!onSeed) return
        setSeeding(true)
        try {
            const g = await onSeed()
            if (g && g.blocks.length) {
                pushHistory()
                setNodes(g.blocks.map(blockToNode))
                setEdges(g.edges.map(edgeToRf))
                setInspectId(null)
                setRailTab('variants')
                requestAnimationFrame(() => {
                    try {
                        rf.fitView({ padding: 0.2, duration: 400 })
                    } catch {
                        /* ignore */
                    }
                })
                toast.success(`Đã nạp ${g.blocks.length} block từ Velox · Ctrl+Z để hoàn tác.`)
            } else {
                toast.message('Velox chưa có gì để nạp.')
            }
        } catch {
            toast.error('Không nạp được từ Velox.')
        } finally {
            setSeeding(false)
        }
    }, [onSeed, pushHistory, rf])

    const doAutoLayout = useCallback(() => {
        if (!nodesRef.current.length) return
        const pos = autoLayout(nodesRef.current, edgesRef.current)
        pushHistory()
        setNodes((nds) => nds.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)))
        requestAnimationFrame(() => {
            try {
                rf.fitView({ padding: 0.2, duration: 400 })
            } catch {
                /* ignore */
            }
        })
    }, [pushHistory, rf])

    const fit = useCallback(() => {
        try {
            rf.fitView({ padding: 0.2, duration: 350 })
        } catch {
            /* ignore */
        }
    }, [rf])

    // ── inspector ─────────────────────────────────────────────────────────────
    const inspectBlock = useMemo(
        () => graph.blocks.find((b) => b.id === inspectId) ?? null,
        [graph.blocks, inspectId],
    )
    const applyPatch = useCallback(
        (patch: Partial<HookGraph['blocks'][number]>) => {
            setNodes((nds) =>
                nds.map((n) => (n.id === inspectId ? { ...n, data: { ...n.data, ...patch } } : n)),
            )
        },
        [inspectId],
    )

    // ── hover-highlight (variant rows + node hover) ───────────────────────────
    const onHoverPath = useCallback((blockIds: string[] | null) => {
        if (!blockIds) {
            setHighlight(null)
            return
        }
        const ek = new Set<string>()
        for (let i = 0; i < blockIds.length - 1; i++) ek.add(`${blockIds[i]}->${blockIds[i + 1]}`)
        setHighlight({ blocks: new Set(blockIds), edges: ek })
    }, [])
    const onNodeMouseEnter = useCallback(
        (_: unknown, node: HookNode) => {
            const idxs = pathIndicesThroughBlock(readout, node.id)
            if (!idxs.size) {
                setHighlight({ blocks: new Set([node.id]), edges: new Set() })
                return
            }
            const blocks = new Set<string>()
            idxs.forEach((i) => readout.paths[i]?.blockIds.forEach((b) => blocks.add(b)))
            setHighlight({ blocks, edges: edgeKeysForPaths(readout, idxs) })
        },
        [readout],
    )
    const onNodeMouseLeave = useCallback(() => setHighlight(null), [])

    // ── display projections (inject callbacks + highlight flags) ──────────────
    const displayNodes = useMemo(
        () =>
            nodes.map((n) => ({
                ...n,
                data: {
                    ...n.data,
                    readOnly: false,
                    onRename,
                    onEdit,
                    onDelete,
                    onOpen,
                    dim: highlight ? !highlight.blocks.has(n.id) : false,
                    highlight: highlight ? highlight.blocks.has(n.id) : false,
                },
            })),
        [nodes, highlight, onRename, onEdit, onDelete, onOpen],
    )
    const displayEdges = useMemo(
        () =>
            edges.map((e) => {
                const key = `${e.source}->${e.target}`
                const hot = highlight?.edges.has(key)
                const dim = highlight && !hot
                return {
                    ...e,
                    animated: !!hot,
                    className: hot ? 'hg-hot' : dim ? 'hg-dim' : undefined,
                }
            }),
        [edges, highlight],
    )

    // ── undo/redo keyboard ────────────────────────────────────────────────────
    useEffect(() => {
        const el = wrapperRef.current
        if (!el) return
        const onKey = (e: KeyboardEvent) => {
            const mod = e.ctrlKey || e.metaKey
            if (!mod) return
            const t = e.target as HTMLElement | null
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
            const k = e.key.toLowerCase()
            if (k === 'z') {
                e.preventDefault()
                if (e.shiftKey) redo()
                else undo()
            } else if (k === 'y') {
                e.preventDefault()
                redo()
            } else if (k === 'n') {
                // Ctrl/Cmd+N → new block. Some browsers reserve this for a new
                // window; preventDefault works inside the focused canvas, and the
                // "+ Block" button / double-click are reliable fallbacks.
                e.preventDefault()
                addBlock()
            }
        }
        el.addEventListener('keydown', onKey)
        return () => el.removeEventListener('keydown', onKey)
    }, [undo, redo, addBlock])

    // ── double-click empty canvas → add a block at the cursor ─────────────────
    useEffect(() => {
        const el = wrapperRef.current
        if (!el) return
        const onDbl = (e: MouseEvent) => {
            const t = e.target as HTMLElement | null
            // Only when the double-click landed on the empty pane / background —
            // not on a node, edge, control or the right rail.
            if (
                t &&
                (t.classList.contains('react-flow__pane') ||
                    t.classList.contains('react-flow__background'))
            ) {
                addBlock({ x: e.clientX, y: e.clientY })
            }
        }
        el.addEventListener('dblclick', onDbl)
        return () => el.removeEventListener('dblclick', onDbl)
    }, [addBlock])

    const canUndo = past.current.length > 0
    const canRedo = future.current.length > 0

    return (
        <div ref={wrapperRef} className="hgx flex" style={{ height }} tabIndex={-1}>
            <div className="relative min-w-0 flex-1">
                <ReactFlow<HookNode, Edge>
                    nodes={displayNodes}
                    edges={displayEdges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    isValidConnection={isValidConnection}
                    onNodeDragStart={onNodeDragStart}
                    onNodeMouseEnter={onNodeMouseEnter}
                    onNodeMouseLeave={onNodeMouseLeave}
                    onNodeClick={(_, n) => {
                        setInspectId(n.id)
                        setRailTab('inspect')
                    }}
                    onPaneClick={() => {
                        setInspectId(null)
                        setRailTab('variants')
                    }}
                    defaultViewport={initialGraph?.viewport}
                    fitView={!initialGraph?.viewport}
                    fitViewOptions={{ padding: 0.25 }}
                    snapToGrid
                    snapGrid={[16, 16]}
                    minZoom={0.2}
                    maxZoom={1.8}
                    deleteKeyCode={['Delete', 'Backspace']}
                    multiSelectionKeyCode={['Meta', 'Shift']}
                    selectionKeyCode={'Shift'}
                    /* [UX] Easier wiring: loose mode lets a drag start from either
                       port and drop anywhere on the target card; a generous radius
                       snaps the connection without pixel-perfect aim. Panning stays
                       on left-drag; Shift+drag draws a marquee for multi-select. */
                    connectionMode={ConnectionMode.Loose}
                    connectionRadius={52}
                    /* Double-click adds a block at the cursor (see the dblclick
                       handler), so don't let it zoom instead. */
                    zoomOnDoubleClick={false}
                    proOptions={{ hideAttribution: false }}
                >
                    <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
                    <Controls showInteractive={false} position="bottom-left" />

                    <Panel position="top-left">
                        <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-[#15131d]/80 p-1 shadow-xl shadow-black/50 backdrop-blur-xl">
                            <ToolBtn
                                onClick={() => addBlock()}
                                title="Thêm block (Ctrl+N · hoặc nhấp đúp vào canvas)"
                                accent
                            >
                                <span className="text-base leading-none">+</span> Block
                            </ToolBtn>
                            {onSeed && (
                                <ToolBtn onClick={doSeed} title="Đổ sẵn graph từ Velox" disabled={seeding}>
                                    {seeding ? '⏳' : '✨'} Đổ sẵn từ Velox
                                </ToolBtn>
                            )}
                            {onSave && (
                                <ToolBtn onClick={doSave} title="Lưu cấu hình sơ đồ" disabled={savingMap} accent>
                                    {savingMap ? '⏳' : '💾'} {saveLabel}
                                </ToolBtn>
                            )}
                            <span className="mx-0.5 h-5 w-px bg-white/10" />
                            <ToolBtn onClick={undo} title="Hoàn tác (Ctrl+Z)" disabled={!canUndo}>
                                ↶
                            </ToolBtn>
                            <ToolBtn onClick={redo} title="Làm lại (Ctrl+Shift+Z)" disabled={!canRedo}>
                                ↷
                            </ToolBtn>
                            <span className="mx-0.5 h-5 w-px bg-white/10" />
                            <ToolBtn onClick={doAutoLayout} title="Tự sắp xếp">
                                ⊞ Sắp xếp
                            </ToolBtn>
                            <ToolBtn onClick={fit} title="Vừa khung">
                                ⤢
                            </ToolBtn>
                        </div>
                    </Panel>

                    {/* [UX] Bulk-tag bar — Shift+drag a marquee or Shift+click to pick
                        several blocks, then one click tags them all the same colour. */}
                    {selectedIds.length >= 2 && (
                        <Panel position="top-center">
                            <div className="flex items-center gap-2 rounded-xl border border-violet-400/30 bg-[#15131d]/90 px-3 py-1.5 shadow-xl shadow-black/50 backdrop-blur-xl">
                                <span className="shrink-0 text-[11.5px] font-semibold text-violet-100">
                                    {selectedIds.length} block · gắn nhãn:
                                </span>
                                <div className="flex flex-wrap items-center gap-1">
                                    {TAG_PALETTE.map((t) => (
                                        <button
                                            key={t.key}
                                            type="button"
                                            title={`Gắn nhãn "${t.label}" cho ${selectedIds.length} block`}
                                            onClick={() => applyTagToSelected(t.key)}
                                            className="h-6 rounded-md border px-1.5 text-[10px] font-semibold transition-transform hover:scale-105"
                                            style={{
                                                color: t.hex,
                                                background: rgba(t.hex, 0.16),
                                                borderColor: rgba(t.hex, 0.4),
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </Panel>
                    )}

                    <Panel position="top-right">
                        <div className="rounded-xl border border-violet-400/20 bg-[#15131d]/80 px-3 py-1.5 shadow-xl shadow-black/50 backdrop-blur-xl">
                            <span className="text-lg font-bold tabular-nums text-violet-200">
                                {readout.truncated ? `${readout.count}+` : readout.count}
                            </span>
                            <span className="ml-1.5 text-[11px] text-zinc-400">biến thể</span>
                        </div>
                    </Panel>
                </ReactFlow>
            </div>

            {/* right rail */}
            <aside className="flex w-[270px] shrink-0 flex-col border-l border-white/10 bg-[#100f18]/85 backdrop-blur-xl">
                <div className="flex gap-1 border-b border-white/10 p-1.5">
                    {(
                        [
                            ['variants', `Biến thể`],
                            ['inspect', 'Thuộc tính'],
                        ] as const
                    ).map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setRailTab(key)}
                            className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-semibold transition-colors ${
                                railTab === key
                                    ? 'bg-violet-500/20 text-violet-100'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <div className="min-h-0 flex-1">
                    {railTab === 'variants' ? (
                        <HookVariantPanel
                            readout={readout}
                            blocks={graph.blocks}
                            onHoverPath={onHoverPath}
                        />
                    ) : inspectBlock ? (
                        <HookInspector
                            block={inspectBlock}
                            onChange={applyPatch}
                            onClose={() => {
                                setInspectId(null)
                                setRailTab('variants')
                            }}
                            onEditStart={pushHistoryThrottled}
                        />
                    ) : (
                        <div className="space-y-2.5 px-4 py-7 text-[11.5px] leading-relaxed text-zinc-500">
                            <p className="text-center">
                                Chọn một block trên canvas để sửa thuộc tính.
                            </p>
                            <ul className="space-y-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-[11px]">
                                <li>
                                    <span className="text-violet-300">+ Block</span> · nhấp đúp canvas ·{' '}
                                    <span className="text-zinc-400">Ctrl+N</span> — thêm block
                                </li>
                                <li>Kéo từ chấm tròn bên phải sang block khác — nối dây</li>
                                <li>
                                    <span className="text-zinc-400">Shift + kéo</span> hoặc{' '}
                                    <span className="text-zinc-400">Shift + bấm</span> — chọn nhiều block rồi
                                    gắn nhãn hàng loạt
                                </li>
                            </ul>
                        </div>
                    )}
                </div>
            </aside>
        </div>
    )
}

export function HookGraphEditor(props: HookGraphEditorProps) {
    return (
        <ReactFlowProvider>
            <Flow {...props} />
        </ReactFlowProvider>
    )
}
