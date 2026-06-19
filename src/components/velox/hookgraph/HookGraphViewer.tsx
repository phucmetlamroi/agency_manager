'use client'

/**
 * [Hook Graph — read-only viewer]  (P7)
 *
 * Renders a saved HookGraph without editing affordances. Clicking a block opens
 * its source URL in a new tab (SRS §3.4). Used in task detail / share contexts.
 */

import { useCallback, useMemo } from 'react'
import {
    ReactFlow,
    ReactFlowProvider,
    Background,
    BackgroundVariant,
    MiniMap,
    Panel,
    type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { HookGraph } from '@/lib/velox/hook-graph-types'
import { enumeratePaths } from '@/lib/velox/hook-graph-paths'
import { HookBlockNode, type HookNode, type HookNodeData } from './HookBlockNode'
import { tagHex } from './hook-graph-style'
import './hookgraph.css'

const nodeTypes = { hookBlock: HookBlockNode }

export interface HookGraphViewerProps {
    graph: HookGraph
    height?: number
}

function ViewerInner({ graph, height = 440 }: HookGraphViewerProps) {
    const onOpen = useCallback(
        (id: string) => {
            const b = graph.blocks.find((x) => x.id === id)
            if (!b) return
            const url = (b.url?.trim() || b.timecode?.fileUrl?.trim()) ?? null
            if (url) window.open(url, '_blank', 'noopener,noreferrer')
        },
        [graph],
    )

    const nodes: HookNode[] = useMemo(
        () =>
            graph.blocks.map((b) => ({
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
                    readOnly: true,
                    onOpen,
                },
            })),
        [graph, onOpen],
    )
    const edges: Edge[] = useMemo(
        () => graph.edges.map((e) => ({ id: e.id, source: e.from, target: e.to })),
        [graph],
    )
    const readout = useMemo(() => enumeratePaths(graph), [graph])

    return (
        <div className="hgx" style={{ height }}>
            <ReactFlow<HookNode, Edge>
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.25 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                minZoom={0.2}
                maxZoom={1.8}
                proOptions={{ hideAttribution: false }}
                onNodeClick={(_, n) => onOpen(n.id)}
            >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1.5} />
                <MiniMap
                    pannable
                    position="bottom-right"
                    nodeColor={(n) => tagHex((n.data as HookNodeData).tag)}
                    nodeStrokeWidth={0}
                    maskColor="rgba(11,10,18,0.6)"
                />
                <Panel position="top-right">
                    <div className="rounded-xl border border-violet-400/20 bg-[#15131d]/80 px-3 py-1.5 shadow-xl shadow-black/50 backdrop-blur-xl">
                        <span className="text-base font-bold tabular-nums text-violet-200">
                            {readout.truncated ? `${readout.count}+` : readout.count}
                        </span>
                        <span className="ml-1.5 text-[11px] text-zinc-400">biến thể</span>
                    </div>
                </Panel>
            </ReactFlow>
        </div>
    )
}

export function HookGraphViewer(props: HookGraphViewerProps) {
    return (
        <ReactFlowProvider>
            <ViewerInner {...props} />
        </ReactFlowProvider>
    )
}
