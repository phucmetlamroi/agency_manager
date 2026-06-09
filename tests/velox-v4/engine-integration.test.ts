/**
 * [Velox v4 — Engine end-to-end integration tests]
 * Run: `npx tsx tests/velox-v4/engine-integration.test.ts`
 *
 * Verifies the full pipeline (Pass 1 triage + Pass 2 classify + P2 grouper)
 * against AC1-AC4 spec fixtures. Real Dropbox/Drive folder shapes are
 * mocked as JSON trees.
 */

import { runEngineV4 } from '../../src/lib/velox/v4-engine'
import type {
    ScanInputFile,
    ScanInputFolder,
    ScanInputNode,
    VeloxScanInput,
} from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function file(name: string): ScanInputFile {
    return { name, path: name, isFolder: false }
}
function folder(name: string, children: ScanInputNode[]): ScanInputFolder {
    return { name, path: name, isFolder: true, children }
}
function input(tree: ScanInputNode[]): VeloxScanInput {
    return {
        rootFolder: { provider: 'dropbox', name: 'root', url: 'dbx://root' },
        tree,
    }
}

console.log('\n=== engine-integration.test.ts ===')

// ── AC1 — LGR fixture (root-level files + shared CTA + source buckets) ──
{
    const tree: ScanInputNode[] = [
        file('LGR Video 1 Hooks.mov'),
        file('LGR Video 1 Body.mov'),
        file('LGR Video 2 Hooks.mov'),
        file('LGR Video 2.mov'),
        file('LGR Video 3 Hooks.mov'),
        file('LGR Video 3.mov'),
        file('Main CTA.mp4'),
        folder('Video 1 A Roll', [
            file('Nested Sequence 247.mp4'),
            file('Nested Sequence 248.mp4'),
        ]),
        folder('B-Roll', [
            file('Nested Sequence 300.mp4'),
            file('Nested Sequence 301.mp4'),
        ]),
        folder('Images', [file('headshot.jpg')]),
    ]
    const { result } = runEngineV4(input(tree))

    ok('AC1 — schemaVersion = velox-4.0', result.schemaVersion === 'velox-4.0')
    ok('AC1 — 3 concepts detected (Video 1, 2, 3)',
        result.stats.conceptsDetected === 3,
        `got ${result.stats.conceptsDetected}`)
    const labels = result.concepts.map(c => c.label).sort()
    ok('AC1 — concept labels = [Video 1, Video 2, Video 3]',
        labels.join(',') === 'Video 1,Video 2,Video 3',
        `got [${labels.join(', ')}]`)
    ok('AC1 — sharedAssets has Main CTA',
        result.sharedAssets.some(n => n.role === 'CTA' && /main cta/i.test(n.files[0].name)),
        `shared=[${result.sharedAssets.map(n => n.files[0].name).join(', ')}]`)
    ok('AC1 — every Video N hooks node is a compilation',
        result.concepts.every(c =>
            c.nodes.filter(n => n.role === 'HOOK').every(n => n.isCompilation),
        ),
        `comp flags by concept=${result.concepts.map(c => c.nodes.filter(n => n.role === 'HOOK').map(n => n.isCompilation)).join(' | ')}`)
    ok('AC1 — Nested Sequence files all in Raw tray',
        result.trays.raw.filter(f => /^nested\s*sequence/i.test(f.name)).length === 4,
        `raw count=${result.trays.raw.length}`)
    ok('AC1 — no concept "main" (shared was extracted)',
        !result.concepts.some(c => c.id === 'c_main'),
        `concept ids=[${result.concepts.map(c => c.id).join(', ')}]`)
}

// ── AC2 — OBJ fixture (NO Use → SUPERSEDED, Replacement → ACTIVE) ───────
{
    const tree: ScanInputNode[] = [
        folder('Video 1', [
            file('H1.mp4'),
            file('H2 NO Use.mov'),
            file('H2 Replacement.mov'),
            file('H3.mp4'),
            file('H4 Future edits.mov'),
            file('H5 Future edits.mov'),
            file('Body 1.mov'),
            file('Body 2 20 seconds.mov'),
            file('Body 3.mov'),
            file('Body 5.mov'),         // gap at 4 — spec wants order preserved
            file('Body 6.mov'),
            file('Body 7.mov'),
            file('Body 8.mov'),
            file('CTA 20 seconds.mp4'),
            file('Nested Sequence 176.mp4'),
            file('Nested Sequence 180.mp4'),
        ]),
        file('Non use.mp4'),
    ]
    const { result } = runEngineV4(input(tree))

    const v1 = result.concepts.find(c => c.label === 'Video 1')!
    ok('AC2 — concept Video 1 found', !!v1)

    const h2NoUse = v1.nodes.find(n => n.files[0].name === 'H2 NO Use.mov')!
    const h2Repl = v1.nodes.find(n => n.files[0].name === 'H2 Replacement.mov')!
    ok('AC2 — H2 NO Use → SUPERSEDED',
        h2NoUse?.status === 'SUPERSEDED',
        `got ${h2NoUse?.status}`)
    ok('AC2 — H2 Replacement → ACTIVE',
        h2Repl?.status === 'ACTIVE',
        `got ${h2Repl?.status}`)

    const pending = v1.nodes.filter(n => n.status === 'PENDING')
    ok('AC2 — H4/H5 Future edits → PENDING',
        pending.length >= 2,
        `pending count=${pending.length}`)

    // Bodies (gap at 4)
    const bodies = v1.nodes.filter(n => n.role === 'BODY')
    const bodyIndices = bodies.map(n => n.index ?? -1).sort((a, b) => a - b)
    ok('AC2 — bodies present without inventing missing #4',
        bodyIndices.includes(1) && bodyIndices.includes(8) && !bodyIndices.includes(4),
        `body indices=[${bodyIndices.join(',')}]`)

    // CTA duration extracted
    const cta = v1.nodes.find(n => n.role === 'CTA')!
    ok('AC2 — CTA duration = 20s',
        cta?.modifiers?.durationSec === 20,
        `got ${cta?.modifiers?.durationSec}`)

    // Raw tray
    ok('AC2 — Nested Sequence files → Raw tray',
        result.trays.raw.some(f => /^nested\s*sequence/i.test(f.name)),
        `raw=[${result.trays.raw.map(f => f.name).join(',')}]`)
}

// ── AC3 — Glenesk & Lochlands (brand prefix concepts) ───────────────────
{
    const tree: ScanInputNode[] = [
        file('Glenesk General Hooks.mov'),
        file('Glenesk open day hook.mov'),
        file('Glenesk CTA\'s!.mov'),
        file('Glenesk Video 1.mov'),
        file('Lochlands Hooks.mov'),
        file('Lochlands CTA.mov'),
        file('Lochlands Video 1.mov'),
        folder('Glenesk A-roll', [file('Nested Sequence 99.mp4')]),
    ]
    const { result } = runEngineV4(input(tree))

    const labels = result.concepts.map(c => c.label).sort()
    ok('AC3 — concept labels include Glenesk + Lochlands (+ Video 1 from filename rule)',
        labels.includes('Glenesk') && labels.includes('Lochlands'),
        `labels=[${labels.join(', ')}]`)

    const glen = result.concepts.find(c => c.label === 'Glenesk')!
    ok('AC3 — Glenesk concept has hooks via word-match',
        glen?.nodes.some(n => n.role === 'HOOK'),
        `glenesk roles=[${glen?.nodes.map(n => n.role).join(',')}]`)
    ok('AC3 — Glenesk "CTA\'s!" detected as CTA',
        glen?.nodes.some(n => n.role === 'CTA'),
        `glenesk roles=[${glen?.nodes.map(n => n.role).join(',')}]`)
}

// ── AC4 — April18 (callouts + part merge + script PDF + finals) ─────────
{
    const tree: ScanInputNode[] = [
        folder('Footage', [
            file('Hook 1 (part 1).mov'),
            file('Hook 1 (part 2).mov'),
            file('Hook 2 (Part 1).mov'),
            file('Hook 2 (Part 2).mov'),
            file('Hook 3 (part 1).mov'),
            file('Hook 3 (part 2).mov'),
            file('Hook 3 (part 3).mov'),
            file('Body (part 1).mov'),
            file('Body (part 2).mov'),
            file('Body (part 3).mov'),
            file('Body (part 4).mov'),
            file('Body (part 5).mov'),
            file('Audience callout 1.mp4'),
            file('Audience callout 2.mp4'),
            file('Audience callout 3.mp4'),
            file('Call to action.mp4'),
        ]),
        folder('Exports', [
            file('A&W Care Ad 1 (Kitchener Homeowners).mov'),
            file('A&W Care Ad 2 (Tri-City Homeowners).mov'),
            file('A&W Care Ad 3 (Listen Up).mov'),
        ]),
        file('W&A Care Ad Script.pdf'),
    ]
    const { result } = runEngineV4(input(tree))

    // Default concept "Main" since no Video N / brand prefix
    const main = result.concepts.find(c => c.label === 'Main')
    ok('AC4 — Main concept exists', !!main,
        `concepts=[${result.concepts.map(c => c.label).join(', ')}]`)

    const hookNodes = main?.nodes.filter(n => n.role === 'HOOK') ?? []
    ok('AC4 — exactly 3 hook nodes (parts merged)',
        hookNodes.length === 3,
        `got ${hookNodes.length}`)
    const h3 = hookNodes.find(n => n.index === 3)!
    ok('AC4 — Hook 3 carries 3 parts sorted',
        h3?.files.length === 3 && h3.files.every((f, i) => f.part === i + 1),
        `Hook 3 parts=[${h3?.files.map(f => f.part).join(',')}]`)

    const body = main?.nodes.find(n => n.role === 'BODY')!
    ok('AC4 — Body merged 5 parts',
        body?.files.length === 5)

    const callouts = main?.nodes.filter(n => n.role === 'CALLOUT') ?? []
    ok('AC4 — 3 callouts',
        callouts.length === 3,
        `got ${callouts.length}`)

    const cta = main?.nodes.find(n => n.role === 'CTA')!
    ok('AC4 — "Call to action" detected as CTA',
        !!cta,
        `cta=${cta?.files[0]?.name}`)

    // FINAL videos from Exports folder
    const allFinals = result.concepts.flatMap(c => c.finals)
    ok('AC4 — 3 finals from Exports / "Ad N" pattern',
        allFinals.length >= 3,
        `finals=${allFinals.length} ${allFinals.map(f => f.files[0].name).join(' | ')}`)

    // Script PDF — currently routed via root file role detection
    const scriptNodes = result.concepts.flatMap(c => c.nodes).filter(n => n.role === 'SCRIPT')
    ok('AC4 — script PDF detected',
        scriptNodes.length === 1 && scriptNodes[0].files[0].name.toLowerCase().endsWith('.pdf'),
        `script nodes=${scriptNodes.length}`)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
