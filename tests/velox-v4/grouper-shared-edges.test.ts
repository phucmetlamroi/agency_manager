/**
 * [Velox v4 — Grouper shared CTA + fan-out edges tests]
 * Run: `npx tsx tests/velox-v4/grouper-shared-edges.test.ts`
 *
 * Covers §3.7d (fan-out edges) + §3.7e (shared assets).
 */

import {
    mergeParts,
    applyStatusChain,
    extractSharedAssets,
    buildFanOutEdges,
    type PartMergeInput,
    type PreNode,
} from '../../src/lib/velox/v4-grouper'
import { classifyFile } from '../../src/lib/velox/v4-role-classifier'
import type { MappedNode } from '../../src/lib/velox/v4-engine'
import type { VeloxFile } from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function make(
    filename: string,
    conceptKey = 'video-1',
    conceptLabel = 'Video 1',
): PartMergeInput {
    const file: VeloxFile = {
        name: filename, path: filename, url: 'stub',
        ext: filename.split('.').pop() ?? '', sizeBytes: 0,
    }
    const node: MappedNode = {
        file, verdict: classifyFile(filename),
        folderPath: conceptLabel, parentFolder: undefined,
    }
    return { node, conceptKey, conceptLabel, conceptSource: 'subfolder' }
}

function bucketByConcept(nodes: PreNode[]): Map<string, PreNode[]> {
    const out = new Map<string, PreNode[]>()
    for (const n of nodes) {
        if (!out.has(n.conceptKey)) out.set(n.conceptKey, [])
        out.get(n.conceptKey)!.push(n)
    }
    return out
}

console.log('\n=== grouper-shared-edges.test.ts ===')

// ── LGR fixture: Video 1/2/3 + shared Main CTA ──────────────────────────
{
    const items = [
        make('H1.mp4', 'video-1', 'Video 1'),
        make('Body.mov', 'video-1', 'Video 1'),
        make('H1.mp4', 'video-2', 'Video 2'),
        make('Body.mov', 'video-2', 'Video 2'),
        make('H1.mp4', 'video-3', 'Video 3'),
        make('Body.mov', 'video-3', 'Video 3'),
        make('Main CTA.mp4', 'main', 'Main'),
    ]
    const pre = mergeParts(items)
    const { active } = applyStatusChain(pre)
    const byConcept = bucketByConcept(active)
    const { byConcept: pruned, shared } = extractSharedAssets(byConcept)

    ok('Main CTA pulled out as shared (1 node)',
        shared.length === 1 && shared[0].role === 'CTA',
        `shared=[${shared.map(n => n.role).join(',')}]`)
    ok('"main" concept removed after extracting shared (no other main nodes)',
        !pruned.has('main'))
    ok('Video 1/2/3 concepts intact',
        pruned.has('video-1') && pruned.has('video-2') && pruned.has('video-3'))
}

// ── Fan-out: hook → body → cta inside one concept ───────────────────────
{
    const items = [
        make('H1.mp4', 'video-1', 'Video 1'),
        make('H2.mp4', 'video-1', 'Video 1'),
        make('H3.mp4', 'video-1', 'Video 1'),
        make('Body.mov', 'video-1', 'Video 1'),
        make('CTA.mp4', 'video-1', 'Video 1'),
    ]
    const pre = mergeParts(items)
    const { active, finals } = applyStatusChain(pre)
    const edges = buildFanOutEdges(active, { sharedCtas: [], finals })

    ok('edges count = 4 (3 hook→body + 1 body→cta)',
        edges.length === 4,
        `got ${edges.length} edges`)

    const body = active.find(n => n.role === 'BODY')!
    const cta = active.find(n => n.role === 'CTA')!
    const hookEdges = edges.filter(e => e.to === body.id)
    ok('All 3 hooks fan into Body',
        hookEdges.length === 3,
        `hook→body edges=${hookEdges.length}`)
    ok('Body fans to CTA',
        edges.some(e => e.from === body.id && e.to === cta.id))
}

// ── Fan-out with shared CTA fallback ────────────────────────────────────
{
    const items = [
        make('H1.mp4', 'video-1', 'Video 1'),
        make('Body.mov', 'video-1', 'Video 1'),
        make('Main CTA.mp4', 'main', 'Main'),
    ]
    const pre = mergeParts(items)
    const { active } = applyStatusChain(pre)
    const byConcept = bucketByConcept(active)
    const { byConcept: pruned, shared } = extractSharedAssets(byConcept)
    const videoNodes = pruned.get('video-1')!
    const finals: PreNode[] = []
    const edges = buildFanOutEdges(videoNodes, { sharedCtas: shared, finals })

    ok('Video 1 (no local CTA) uses shared Main CTA',
        edges.some(e => e.to === shared[0].id),
        `edges=${JSON.stringify(edges)}`)
}

// ── No body → hooks fan to FINAL ────────────────────────────────────────
{
    const items = [
        make('LGR Video 1 Hooks.mov', 'video-1', 'Video 1'),
        make('LGR Video 1.mov', 'video-1', 'Video 1'),  // FINAL
    ]
    const pre = mergeParts(items)
    const { active, finals } = applyStatusChain(pre)
    const edges = buildFanOutEdges(active, { sharedCtas: [], finals })

    ok('LGR Video 1 promoted to FINAL', finals.length === 1, `finals=${finals.length}`)
    const hooksNode = active.find(n => n.role === 'HOOK')!
    ok('No body → hook fans into final',
        edges.some(e => e.from === hooksNode.id && e.to === finals[0].id),
        `edges=${JSON.stringify(edges)}`)
}

// ── Callouts ride with hooks into body ─────────────────────────────────
{
    const items = [
        make('Hook 1.mov', 'main', 'Main'),
        make('Audience callout 1.mp4', 'main', 'Main'),
        make('Audience callout 2.mp4', 'main', 'Main'),
        make('Body (part 1).mov', 'main', 'Main'),
        make('Body (part 2).mov', 'main', 'Main'),
        make('Call to action.mp4', 'main', 'Main'),
    ]
    const pre = mergeParts(items)
    const { active, finals } = applyStatusChain(pre)
    const edges = buildFanOutEdges(active, { sharedCtas: [], finals })

    const body = active.find(n => n.role === 'BODY')!
    const cta = active.find(n => n.role === 'CTA')!
    const calloutIds = active.filter(n => n.role === 'CALLOUT').map(n => n.id)
    ok('2 callouts both wired to body',
        calloutIds.every(id => edges.some(e => e.from === id && e.to === body.id)),
        `edges=${edges.length}`)
    ok('Body fans to CTA (Call to action)',
        edges.some(e => e.from === body.id && e.to === cta.id))
}

// ── No other concepts → shared extraction is a no-op ────────────────────
{
    const items = [
        make('Main CTA.mp4', 'main', 'Main'),
        make('Hook 1.mov', 'main', 'Main'),
        make('Body.mov', 'main', 'Main'),
    ]
    const pre = mergeParts(items)
    const { active } = applyStatusChain(pre)
    const byConcept = bucketByConcept(active)
    const { byConcept: pruned, shared } = extractSharedAssets(byConcept)
    ok('Single concept "main" — shared list empty',
        shared.length === 0)
    ok('"main" still present with all 3 nodes',
        pruned.get('main')?.length === 3)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
