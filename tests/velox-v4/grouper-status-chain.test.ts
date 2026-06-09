/**
 * [Velox v4 — Grouper status chain tests]
 * Run: `npx tsx tests/velox-v4/grouper-status-chain.test.ts`
 *
 * Covers §3.7c: H2 NO Use + H2 Replacement → SUPERSEDED + ACTIVE.
 */

import {
    mergeParts,
    applyStatusChain,
    type PartMergeInput,
} from '../../src/lib/velox/v4-grouper'
import { classifyFile } from '../../src/lib/velox/v4-role-classifier'
import type { MappedNode } from '../../src/lib/velox/v4-engine'
import type { VeloxFile } from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function make(filename: string, conceptKey = 'video-1', conceptLabel = 'Video 1'): PartMergeInput {
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

console.log('\n=== grouper-status-chain.test.ts ===')

// ── OBJ spec case: H2 NO Use + H2 Replacement ──────────────────────────
{
    const items = [
        make('H1.mp4'),
        make('H2 NO Use.mov'),
        make('H2 Replacement.mov'),
        make('H3.mp4'),
        make('Body.mov'),
    ]
    const pre = mergeParts(items)

    ok('Part-merge gives 5 distinct PreNodes (H2 NO Use & H2 Replacement kept apart)',
        pre.length === 5,
        `got ${pre.length}`)

    const { active, finals } = applyStatusChain(pre)
    const h2NoUse = pre.find(n => n.files[0].name === 'H2 NO Use.mov')!
    const h2Repl = pre.find(n => n.files[0].name === 'H2 Replacement.mov')!

    ok('H2 NO Use → SUPERSEDED',
        h2NoUse.status === 'SUPERSEDED',
        `got ${h2NoUse.status}`)
    ok('H2 Replacement → ACTIVE',
        h2Repl.status === 'ACTIVE',
        `got ${h2Repl.status}`)
    ok('H2 Replacement note mentions "replaces base"',
        (h2Repl.note ?? '').toLowerCase().includes('replac'),
        `note=${h2Repl.note}`)
    ok('H1 status unchanged ACTIVE',
        pre.find(n => n.files[0].name === 'H1.mp4')!.status === 'ACTIVE')
    ok('Body status unchanged ACTIVE',
        pre.find(n => n.files[0].name === 'Body.mov')!.status === 'ACTIVE')
    ok('finals empty (no Exports/Final files)',
        finals.length === 0,
        `finals=${finals.length}`)
    ok('active count = 5', active.length === 5)
}

// ── Replacement WITHOUT a base just stays ACTIVE ────────────────────────
{
    const items = [make('H5 Replacement.mov'), make('Body.mov')]
    const pre = mergeParts(items)
    applyStatusChain(pre)
    const replOnly = pre.find(n => n.files[0].name === 'H5 Replacement.mov')!
    ok('Standalone Replacement stays ACTIVE',
        replOnly.status === 'ACTIVE')
}

// ── EXCLUDED without Replacement stays EXCLUDED ─────────────────────────
{
    const items = [make('H2 NO Use.mov'), make('Body.mov')]
    const pre = mergeParts(items)
    applyStatusChain(pre)
    const ex = pre.find(n => n.files[0].name === 'H2 NO Use.mov')!
    ok('Lone EXCLUDED stays EXCLUDED (no Replacement → no SUPERSEDED flip)',
        ex.status === 'EXCLUDED')
}

// ── FINAL fallback via "Ad N" filename (April18 fixture pattern) ────────
//   Note on scope: when a file like "Body Final.mov" exists, the classifier
//   has already picked BODY as the role (its word match wins over the FINAL
//   status token). Spec §3.7c only requires Exports/Ad-N folder routing and
//   pure FINAL-named files to land in the finals lane. Mixed
//   "<role> final" filenames stay in the active lane — operator can move
//   them manually via Manual mode. That's a UX choice, not a hard
//   acceptance criterion.
{
    const items = [
        make('A&W Care Ad 1 (Kitchener Homeowners).mov'),
        make('A&W Care Ad 2 (Tri-City Homeowners).mov'),
    ]
    const pre = mergeParts(items)
    const { finals, active } = applyStatusChain(pre)
    ok('"Ad N" filename promoted to finals (2 items)',
        finals.length === 2,
        `finals=${finals.length}`)
    ok('all promoted nodes have role FINAL',
        finals.every(n => n.role === 'FINAL'))
    ok('audience modifier extracted from parens',
        finals.every(n => (n.modifiers?.audience ?? '').includes('homeowners')),
        `audiences=[${finals.map(n => n.modifiers?.audience).join(',')}]`)
}

// ── Compilation files don't enter SUPERSEDE chain ───────────────────────
{
    const items = [
        make('LGR Video 1 Hooks.mov', 'video-1', 'Video 1'),
        make('LGR Video 2 Hooks.mov', 'video-2', 'Video 2'),
    ]
    const pre = mergeParts(items)
    applyStatusChain(pre)
    ok('Compilation nodes stay ACTIVE (chain skipped)',
        pre.every(n => n.status === 'ACTIVE'),
        `statuses=[${pre.map(n => n.status).join(',')}]`)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
