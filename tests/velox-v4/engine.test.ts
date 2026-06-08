/**
 * [Velox v4 — Engine integration tests]
 * Run: `npx tsx tests/velox-v4/engine.test.ts`
 *
 * Hand-built mini-fixtures stand in for the 4 real folders until P1.9 ships
 * the full JSON tree fixtures.
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

console.log('\n=== engine.test.ts ===')

// — Mini OBJ-style: Video 1 with H1-H5 + Body 1-3 + CTA, plus B-Roll
{
    const tree: ScanInputNode[] = [
        folder('Video 1', [
            file('H1.mp4'),
            file('H2 NO Use.mov'),
            file('H2 Replacement.mov'),
            file('H3.mp4'),
            file('H4 Future edits.mov'),
            file('Body 1.mov'),
            file('Body 2 20 seconds.mov'),
            file('Body 3.mov'),
            file('CTA 20 seconds.mp4'),
        ]),
        folder('B-Roll', [
            file('Nested Sequence 100.mp4'),
            file('Nested Sequence 101.mp4'),
        ]),
        folder('Random raw', [
            file('Nested Sequence 200.mp4'),
            file('Nested Sequence 201.mp4'),
            file('Nested Sequence 202.mp4'),
            file('DSC0419.MOV'),
        ]),
        file('Non use.mp4'),
    ]
    const { result, intermediate } = runEngineV4(input(tree))

    ok('schemaVersion = velox-4.0', result.schemaVersion === 'velox-4.0')
    ok('stats.totalFiles = 16 (9 Video 1 + 2 B-Roll + 4 Random raw + 1 root)',
        result.stats.totalFiles === 16,
        `got ${result.stats.totalFiles}`)
    ok('mappedNodes count = 9 (H1-H5 + Body 1-3 + CTA, all role-tokened)',
        intermediate.mappedNodes.length === 9,
        `got ${intermediate.mappedNodes.length}`)
    ok('rawFiles count = 6 (2 in B-Roll + 4 in Random raw)',
        result.stats.rawFiles === 6,
        `got ${result.stats.rawFiles}`)
    ok('hooksDetected = 5 (H1, H2 NO Use, H2 Replacement, H3, H4)',
        result.stats.hooksDetected === 5,
        `got ${result.stats.hooksDetected}`)
    ok('Non use.mp4 reaches mappedNodes (status EXCLUDED)',
        intermediate.mappedNodes.some(m => m.file.name === 'Non use.mp4') ||
        intermediate.unsorted.some(u => u.name === 'Non use.mp4'),
        `mapped names=[${intermediate.mappedNodes.map(m => m.file.name).join(', ')}]`)

    // H1 should now be HIGH because Body & CTA siblings boost it.
    const h1 = intermediate.mappedNodes.find(m => m.file.name === 'H1.mp4')!
    ok('H1.mp4 mapped',
        !!h1 && h1.verdict.role === 'HOOK' && h1.verdict.index === 1,
        `verdict=${JSON.stringify(h1?.verdict.role)} idx=${h1?.verdict.index}`)
    ok('H1.mp4 confidence boosted by Body/CTA siblings',
        h1.verdict.confidence === 0.9 && h1.verdict.band === 'HIGH',
        `conf=${h1.verdict.confidence} band=${h1.verdict.band}`)

    // B-Roll is SOURCE_BUCKET → its files reach the Raw tray.
    ok('Nested Sequence 100.mp4 in Raw tray (source bucket)',
        intermediate.raw.some(r => r.name === 'Nested Sequence 100.mp4'))
    // Random raw is RAW_DUMP → also Raw tray.
    ok('DSC0419.MOV in Raw tray (raw dump folder)',
        intermediate.raw.some(r => r.name === 'DSC0419.MOV'))

    // Folder triage verdicts surfaced for the UI.
    const verdictMap = new Map(intermediate.folderVerdicts.map(v => [v.pathFromRoot, v.verdict.class]))
    ok('Video 1 verdict ORGANIZED', verdictMap.get('Video 1') === 'ORGANIZED')
    ok('B-Roll verdict SOURCE_BUCKET', verdictMap.get('B-Roll') === 'SOURCE_BUCKET')
    ok('Random raw verdict RAW_DUMP', verdictMap.get('Random raw') === 'RAW_DUMP')
}

// — Mini LGR-style: root-level role files + shared CTA + source-bucket subs
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
        ]),
    ]
    const { result, intermediate } = runEngineV4(input(tree))

    ok('LGR mappedNodes = 7 (3 hooks + 1 body + 2 video N + Main CTA)',
        intermediate.mappedNodes.length === 7,
        `got ${intermediate.mappedNodes.length}`)

    const v1hooks = intermediate.mappedNodes.find(m => m.file.name === 'LGR Video 1 Hooks.mov')!
    ok('LGR Video 1 Hooks → compilation, no index',
        !!v1hooks && v1hooks.verdict.isCompilation && v1hooks.verdict.index === undefined,
        `comp=${v1hooks?.verdict.isCompilation} idx=${v1hooks?.verdict.index}`)

    const v2 = intermediate.mappedNodes.find(m => m.file.name === 'LGR Video 2.mov')!
    ok('LGR Video 2.mov (no hook/body) → FINAL fallback',
        !!v2 && v2.verdict.role === 'FINAL',
        `role=${v2?.verdict.role}`)

    ok('Main CTA mapped',
        intermediate.mappedNodes.some(m => m.file.name === 'Main CTA.mp4' && m.verdict.role === 'CTA'))
    ok('LGR raw files routed correctly (3 raw)',
        result.stats.rawFiles === 3,
        `got ${result.stats.rawFiles}`)
}

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
