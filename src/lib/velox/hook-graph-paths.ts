/**
 * [Hook Graph — path / variant engine]
 *
 * Pure graph traversal over a HookGraph. This is the heart of the
 * "máy sinh deliverable": every root→leaf path through the DAG is one video
 * variant. Independent of any UI library so it can be unit-tested and reused
 * server-side for task fan-out later.
 */

import type { HookGraph } from './hook-graph-types'

/** Hard cap so a pathological fan-out (10×10×10…) can't hang the UI. */
export const MAX_VARIANTS = 2000

export interface VariantPath {
    /** Ordered block ids from root to leaf. */
    blockIds: string[]
    /** Σ durationSec of blocks on the path that declare one. */
    runtimeSec: number
}

export interface VariantReadout {
    paths: VariantPath[]
    count: number
    /** True when enumeration hit MAX_VARIANTS and stopped early. */
    truncated: boolean
}

interface Adjacency {
    out: Map<string, string[]>
    inDeg: Map<string, number>
    ids: string[]
}

function buildAdjacency(graph: HookGraph): Adjacency {
    const out = new Map<string, string[]>()
    const inDeg = new Map<string, number>()
    const ids: string[] = []
    const known = new Set<string>()

    for (const b of graph.blocks) {
        out.set(b.id, [])
        inDeg.set(b.id, 0)
        ids.push(b.id)
        known.add(b.id)
    }
    for (const e of graph.edges) {
        // Ignore edges that reference a missing block (defensive).
        if (!known.has(e.from) || !known.has(e.to) || e.from === e.to) continue
        const arr = out.get(e.from)
        if (arr && !arr.includes(e.to)) {
            arr.push(e.to)
            inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1)
        }
    }
    return { out, inDeg, ids }
}

/** Blocks with no incoming edge (start of a variant). */
export function rootBlockIds(graph: HookGraph): string[] {
    const { inDeg, ids } = buildAdjacency(graph)
    return ids.filter((id) => (inDeg.get(id) ?? 0) === 0)
}

/** Blocks with no outgoing edge (end of a variant). */
export function leafBlockIds(graph: HookGraph): string[] {
    const { out, ids } = buildAdjacency(graph)
    return ids.filter((id) => (out.get(id)?.length ?? 0) === 0)
}

/** DFS colour-cycle check on the whole graph. */
export function hasCycle(graph: HookGraph): boolean {
    const { out, ids } = buildAdjacency(graph)
    const state = new Map<string, 0 | 1 | 2>() // 0 unseen, 1 in-stack, 2 done
    ids.forEach((id) => state.set(id, 0))

    const visit = (id: string): boolean => {
        if (state.get(id) === 1) return true
        if (state.get(id) === 2) return false
        state.set(id, 1)
        for (const n of out.get(id) ?? []) {
            if (visit(n)) return true
        }
        state.set(id, 2)
        return false
    }
    for (const id of ids) {
        if (state.get(id) === 0 && visit(id)) return true
    }
    return false
}

/**
 * Would adding edge `from → to` create a cycle? True when `to` can already
 * reach `from` (or it's a self-loop). Used to reject invalid connections live.
 */
export function wouldCreateCycle(graph: HookGraph, from: string, to: string): boolean {
    if (from === to) return true
    const { out } = buildAdjacency(graph)
    const stack = [to]
    const seen = new Set<string>()
    while (stack.length) {
        const cur = stack.pop()!
        if (cur === from) return true
        if (seen.has(cur)) continue
        seen.add(cur)
        for (const n of out.get(cur) ?? []) stack.push(n)
    }
    return false
}

/**
 * Enumerate every root→leaf path. A graph with no edges yields one single-block
 * path per block. Capped at MAX_VARIANTS.
 */
export function enumeratePaths(graph: HookGraph): VariantReadout {
    const { out, inDeg, ids } = buildAdjacency(graph)
    const durById = new Map<string, number>()
    for (const b of graph.blocks) durById.set(b.id, b.durationSec ?? 0)

    const roots = ids.filter((id) => (inDeg.get(id) ?? 0) === 0)
    const paths: VariantPath[] = []
    let truncated = false

    // Guard against cycles — enumeration on a cyclic graph could loop forever.
    if (hasCycle(graph)) {
        return { paths: [], count: 0, truncated: false }
    }

    const walk = (id: string, trail: string[], runtime: number) => {
        if (truncated) return
        const nextTrail = [...trail, id]
        const nextRuntime = runtime + (durById.get(id) ?? 0)
        const nexts = out.get(id) ?? []
        if (nexts.length === 0) {
            if (paths.length >= MAX_VARIANTS) {
                truncated = true
                return
            }
            paths.push({ blockIds: nextTrail, runtimeSec: nextRuntime })
            return
        }
        for (const n of nexts) {
            if (truncated) return
            walk(n, nextTrail, nextRuntime)
        }
    }

    for (const r of roots) {
        if (truncated) break
        walk(r, [], 0)
    }

    return { paths, count: paths.length, truncated }
}

/**
 * Indices (into `readout.paths`) of every path that passes through `blockId`.
 * Drives the hover-highlight interaction.
 */
export function pathIndicesThroughBlock(readout: VariantReadout, blockId: string): Set<number> {
    const set = new Set<number>()
    readout.paths.forEach((p, i) => {
        if (p.blockIds.includes(blockId)) set.add(i)
    })
    return set
}

/** Set of "from→to" edge keys used by the paths at the given indices. */
export function edgeKeysForPaths(readout: VariantReadout, indices: Set<number>): Set<string> {
    const keys = new Set<string>()
    indices.forEach((i) => {
        const p = readout.paths[i]
        if (!p) return
        for (let k = 0; k < p.blockIds.length - 1; k++) {
            keys.add(`${p.blockIds[k]}->${p.blockIds[k + 1]}`)
        }
    })
    return keys
}
