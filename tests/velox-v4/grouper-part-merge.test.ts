/**
 * [Velox v4 — Grouper part-merge tests]
 * Run: `npx tsx tests/velox-v4/grouper-part-merge.test.ts`
 *
 * Covers §3.7b: distinct-part files in same (concept, role, index) merge.
 */

import { mergeParts, type PartMergeInput } from '../../src/lib/velox/v4-grouper'
import { classifyFile } from '../../src/lib/velox/v4-role-classifier'
import type { MappedNode } from '../../src/lib/velox/v4-engine'
import type { VeloxFile } from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function make(filename: string, conceptKey = 'main', conceptLabel = 'Main'): PartMergeInput {
    const file: VeloxFile = {
        name: filename, path: filename, url: 'stub',
        ext: filename.split('.').pop() ?? '', sizeBytes: 0,
    }
    const node: MappedNode = {
        file, verdict: classifyFile(filename),
        folderPath: '', parentFolder: undefined,
    }
    return { node, conceptKey, conceptLabel, conceptSource: 'default' }
}

console.log('\n=== grouper-part-merge.test.ts ===')

// ── April18 pattern: Hook 1 (part 1) + Hook 1 (part 2) merge ────────────
{
    const items = [
        make('Hook 1 (part 1).mov'),
        make('Hook 1 (part 2).mov'),
        make('Hook 2 (part 1).mov'),
        make('Hook 2 (part 2).mov'),
        make('Hook 3 (part 1).mov'),
        make('Hook 3 (part 2).mov'),
        make('Hook 3 (part 3).mov'),
    ]
    const out = mergeParts(items)
    ok('Hook 1 + Hook 2 + Hook 3 each merge → 3 nodes',
        out.length === 3,
        `got ${out.length} nodes`)

    const h1 = out.find(n => n.label === 'Hook 1')!
    ok('Hook 1 node carries 2 files',
        h1?.files.length === 2,
        `files.length=${h1?.files.length}`)
    ok('Hook 1 files sorted by part 1 → 2',
        h1.files[0].part === 1 && h1.files[1].part === 2)

    const h3 = out.find(n => n.label === 'Hook 3')!
    ok('Hook 3 carries 3 parts sorted',
        h3.files.length === 3 && h3.files.every((f, i) => f.part === i + 1),
        `parts=[${h3.files.map(f => f.part).join(',')}]`)
}

// ── Body (5 parts) — April18 pattern ────────────────────────────────────
{
    const items = [
        make('Body (part 1).mov'),
        make('Body (part 2).mov'),
        make('Body (part 3).mov'),
        make('Body (part 4).mov'),
        make('Body (part 5).mov'),
    ]
    const out = mergeParts(items)
    ok('Body 5 parts → 1 merged node',
        out.length === 1 && out[0].files.length === 5)
    ok('Body parts sorted 1→5',
        out[0].files.every((f, i) => f.part === i + 1),
        `parts=[${out[0].files.map(f => f.part).join(',')}]`)
}

// ── Single file (no part) doesn't merge ─────────────────────────────────
{
    const items = [make('Body.mov'), make('CTA.mov')]
    const out = mergeParts(items)
    ok('Single Body + single CTA → 2 nodes',
        out.length === 2)
    ok('Single-file nodes don\'t carry part on file',
        out.every(n => n.files.every(f => f.part === undefined)))
}

// ── Compilation files never merge even if same concept ──────────────────
{
    const items = [
        make('LGR Video 1 Hooks.mov', 'video-1', 'Video 1'),
        make('LGR Video 2 Hooks.mov', 'video-2', 'Video 2'),
    ]
    const out = mergeParts(items)
    ok('Two compilation files (different videos) → 2 nodes',
        out.length === 2,
        `got ${out.length}`)
    ok('compilation nodes have isCompilation=true and note',
        out.every(n => n.isCompilation && typeof n.note === 'string'),
        `comp flags=[${out.map(n => n.isCompilation).join(',')}]`)
}

// ── Different concept keys ≠ merge ──────────────────────────────────────
{
    const items = [
        make('Hook 1 (part 1).mov', 'video-1', 'Video 1'),
        make('Hook 1 (part 1).mov', 'video-2', 'Video 2'),
    ]
    const out = mergeParts(items)
    ok('Same role+index but different concepts stay separate (2 nodes)',
        out.length === 2)
}

// ── Mixed: 2 files w/ part + 1 standalone same (concept, role, index) → highest conf wins, single file used
{
    const items = [
        make('Hook 1.mov'),                 // no part
        make('Hook 1 (part 2).mov'),       // part=2 but only 1 part across, so shouldn't merge
    ]
    const out = mergeParts(items)
    ok('mixed-part group does NOT merge (need distinct part on ALL)',
        out.length === 1 && out[0].files.length === 1,
        `got ${out.length} nodes, first has ${out[0].files.length} files`)
}

// ── Node ids are stable + distinct per bucket ──────────────────────────
{
    const items = [
        make('Hook 1.mov'),
        make('Hook 2.mov'),
        make('Body.mov'),
        make('CTA.mp4'),
    ]
    const out = mergeParts(items)
    const ids = out.map(n => n.id)
    const distinct = new Set(ids)
    ok('All node ids distinct',
        distinct.size === ids.length,
        `ids=[${ids.join(',')}]`)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
