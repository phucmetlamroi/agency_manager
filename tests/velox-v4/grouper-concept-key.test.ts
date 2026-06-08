/**
 * [Velox v4 — Grouper concept key tests]
 * Run: `npx tsx tests/velox-v4/grouper-concept-key.test.ts`
 *
 * Covers §3.7a rules 1-4 + brand-prefix index.
 */

import { resolveConceptKey, buildBrandPrefixIndex } from '../../src/lib/velox/v4-grouper'
import { classifyFile } from '../../src/lib/velox/v4-role-classifier'
import type { MappedNode } from '../../src/lib/velox/v4-engine'
import type { ScanInputFolder, VeloxFile } from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function makeNode(filename: string, parentFolderName?: string): MappedNode {
    const file: VeloxFile = {
        name: filename, path: filename, url: 'stub', ext: filename.split('.').pop() ?? '',
        sizeBytes: 0,
    }
    const parentFolder: ScanInputFolder | undefined = parentFolderName
        ? { name: parentFolderName, path: parentFolderName, isFolder: true, children: [] }
        : undefined
    return {
        file,
        verdict: classifyFile(filename),
        folderPath: parentFolderName ?? '',
        parentFolder,
    }
}

console.log('\n=== grouper-concept-key.test.ts ===')

// ── Rule 1: parent subfolder "Video N" ──────────────────────────────────
{
    const node = makeNode('H1.mp4', 'Video 1')
    const r = resolveConceptKey(node, new Set())
    ok('parent "Video 1" → key=video-1, source=subfolder',
        r.key === 'video-1' && r.label === 'Video 1' && r.source === 'subfolder',
        `got key=${r.key} label=${r.label} source=${r.source}`)
}
{
    const node = makeNode('Body.mov', 'Ad 3')
    const r = resolveConceptKey(node, new Set())
    ok('parent "Ad 3" → key=ad-3, label="Ad 3"',
        r.key === 'ad-3' && r.label === 'Ad 3' && r.source === 'subfolder',
        `got key=${r.key} label=${r.label}`)
}
{
    const node = makeNode('Body.mov', 'Video 2')
    const r = resolveConceptKey(node, new Set())
    ok('parent "Video 2" overrides filename',
        r.key === 'video-2' && r.source === 'subfolder')
}

// ── Rule 2: filename "Video N" (no Video N parent) ──────────────────────
{
    const node = makeNode('LGR Video 1 Body.mov')
    const r = resolveConceptKey(node, new Set())
    ok('filename "LGR Video 1 Body" → key=video-1, source=filename',
        r.key === 'video-1' && r.source === 'filename',
        `got key=${r.key} source=${r.source}`)
}
{
    const node = makeNode('Main CTA.mp4')
    const r = resolveConceptKey(node, new Set())
    ok('"Main CTA" (no video N) → fallback rule 4 (default)',
        r.source === 'default',
        `source=${r.source}`)
}

// ── Rule 3: brand prefix (requires repeat) ──────────────────────────────
{
    const nodes = [
        makeNode('Glenesk General Hooks.mov'),
        makeNode("Glenesk CTA's!.mov"),
        makeNode('Lochlands Hooks.mov'),
        makeNode('Lochlands CTA.mov'),
        makeNode('Standalone Random File.mp4'),
    ]
    const brands = buildBrandPrefixIndex(nodes)
    ok('brand index detects "glenesk"', brands.has('glenesk'),
        `brands=[${[...brands].join(',')}]`)
    ok('brand index detects "lochlands"', brands.has('lochlands'))
    ok('"standalone" NOT a brand (only 1 occurrence)',
        !brands.has('standalone'))
}

{
    const brands = new Set(['glenesk', 'lochlands'])
    const r1 = resolveConceptKey(makeNode('Glenesk General Hooks.mov'), brands)
    ok('Glenesk file → key=brand-glenesk, source=brand_prefix',
        r1.key === 'brand-glenesk' && r1.label === 'Glenesk' && r1.source === 'brand_prefix',
        `got key=${r1.key} label=${r1.label} source=${r1.source}`)
    const r2 = resolveConceptKey(makeNode('Lochlands CTA.mov'), brands)
    ok('Lochlands file → key=brand-lochlands',
        r2.key === 'brand-lochlands' && r2.label === 'Lochlands')
}

// ── Rule 4: default Main ────────────────────────────────────────────────
{
    const node = makeNode('Hook 1.mov')
    const r = resolveConceptKey(node, new Set())
    ok('orphan file → "Main" default',
        r.key === 'main' && r.label === 'Main' && r.source === 'default',
        `got key=${r.key}`)
}

// ── Rule ordering: subfolder beats filename ─────────────────────────────
{
    const node = makeNode('LGR Video 1 Body.mov', 'Video 2')
    const r = resolveConceptKey(node, new Set())
    ok('subfolder rule wins over filename rule',
        r.key === 'video-2' && r.source === 'subfolder')
}

// ── Brand exclusion: video/ad/hook/etc. as first token not a brand ──────
{
    const nodes = [
        makeNode('Video 1.mov'),
        makeNode('Video 2.mov'),
        makeNode('Hook 1.mov'),
        makeNode('Hook 2.mov'),
        makeNode('Body.mov'),
        makeNode('Body 2.mov'),
    ]
    const brands = buildBrandPrefixIndex(nodes)
    ok('"video" excluded from brand candidates', !brands.has('video'),
        `brands=[${[...brands].join(',')}]`)
    ok('"hook" excluded from brand candidates', !brands.has('hook'))
    ok('"body" excluded from brand candidates', !brands.has('body'))
}

// ── Single-char excluded ────────────────────────────────────────────────
{
    const nodes = [makeNode('a clip.mp4'), makeNode('a footage.mp4')]
    const brands = buildBrandPrefixIndex(nodes)
    ok('single-char token "a" excluded from brand', !brands.has('a'))
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
