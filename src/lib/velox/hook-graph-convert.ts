/**
 * [Hook Graph — Velox seed converter]
 *
 * Turns a Velox auto-scan (`VeloxScanResult`) into an editable `HookGraph` so
 * the user can press "Đổ sẵn từ Velox" and start from a populated canvas
 * instead of a blank one. Pure + deterministic (no randomness for positions).
 *
 * Velox node ids are reused as block ids so the concept `edges` ({from,to})
 * map straight across with no remapping.
 */

import type { VeloxScanResult, VeloxNode, VeloxRole } from './v4-types'
import {
    HOOK_GRAPH_SCHEMA_VERSION,
    genId,
    type HookBlock,
    type HookEdge,
    type HookGraph,
} from './hook-graph-types'

/** Velox role → tag palette key (see hook-graph-style.ts). */
const ROLE_TAG: Record<VeloxRole, string> = {
    HOOK: 'hook',
    BODY: 'body',
    CTA: 'cta',
    CALLOUT: 'callout',
    SCRIPT: 'script',
    CAPTION: 'caption',
    FINAL: 'final',
}

/** Horizontal lane index per role (Hook far-left … Final far-right). */
const ROLE_LANE: Record<VeloxRole, number> = {
    HOOK: 0,
    CALLOUT: 0,
    SCRIPT: 0,
    BODY: 1,
    CTA: 2,
    CAPTION: 2,
    FINAL: 3,
}

const LANE_X = 340 // px between lanes
const ROW_Y = 132 // px between stacked nodes in a lane
const BAND_Y = 460 // px between concept bands

function nodeToBlock(node: VeloxNode, x: number, y: number): HookBlock {
    return {
        id: node.id,
        name: node.label || 'Block',
        position: { x, y },
        url: node.files?.[0]?.url || undefined,
        tag: ROLE_TAG[node.role],
        durationSec: node.modifiers?.durationSec,
        note: node.note,
    }
}

export function veloxMapToHookGraph(map: VeloxScanResult): HookGraph {
    const blocks: HookBlock[] = []
    const edges: HookEdge[] = []
    const seen = new Set<string>()

    const placeNodes = (nodes: VeloxNode[], bandTop: number) => {
        // Stack per lane so cards in the same role don't overlap.
        const laneCursor = new Map<number, number>()
        for (const node of nodes) {
            if (seen.has(node.id)) continue
            seen.add(node.id)
            const lane = ROLE_LANE[node.role] ?? 1
            const row = laneCursor.get(lane) ?? 0
            laneCursor.set(lane, row + 1)
            blocks.push(nodeToBlock(node, lane * LANE_X, bandTop + row * ROW_Y))
        }
    }

    // Shared assets sit in a band above the concepts.
    if (map.sharedAssets?.length) {
        placeNodes(map.sharedAssets, -BAND_Y)
    }

    map.concepts.forEach((concept, ci) => {
        const bandTop = ci * BAND_Y
        placeNodes([...concept.nodes, ...concept.finals], bandTop)
        for (const e of concept.edges) {
            edges.push({ id: genId('edge'), from: e.from, to: e.to })
        }
    })

    // Drop edges that reference a node we didn't place (defensive).
    const ids = new Set(blocks.map((b) => b.id))
    const cleanEdges = edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.from !== e.to)

    return {
        schemaVersion: HOOK_GRAPH_SCHEMA_VERSION,
        blocks,
        edges: cleanEdges,
    }
}
