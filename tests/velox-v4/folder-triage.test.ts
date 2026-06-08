/**
 * [Velox v4 — Folder Triage tests]
 * Run: `npx tsx tests/velox-v4/folder-triage.test.ts`
 */

import {
    classifyFolder,
    classifyTree,
    matchesSourceBucket,
    hasRoleToken,
    isRawDumpName,
    isVideo,
    dominantClass,
} from '../../src/lib/velox/v4-folder-triage'
import type { ScanInputFolder, ScanInputNode } from '../../src/lib/velox/v4-types'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, detail?: string) {
    if (cond) { pass++; console.log(`  ✓ ${name}`) }
    else      { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function mkFolder(name: string, children: ScanInputNode[]): ScanInputFolder {
    return { name, path: name, isFolder: true, children }
}
function mkFile(name: string): ScanInputNode {
    return { name, path: name, isFolder: false }
}

console.log('\n=== folder-triage.test.ts ===')

// — matchesSourceBucket
ok('"B-Roll" is source bucket', matchesSourceBucket('B-Roll'))
ok('"a roll" is source bucket', matchesSourceBucket('a roll'))
ok('"Footage" is source bucket', matchesSourceBucket('Footage'))
ok('"Headshots" is source bucket', matchesSourceBucket('Headshots'))
ok('"Video 1" is NOT source bucket', !matchesSourceBucket('Video 1'))
ok('"Exports" is NOT source bucket (deliverable)', !matchesSourceBucket('Exports'))

// — isRawDumpName
ok('Nested Sequence 247.mp4 → raw', isRawDumpName('Nested Sequence 247.mp4'))
ok('DSC0419.MOV → raw', isRawDumpName('DSC0419.MOV'))
ok('C0017.MP4 → raw', isRawDumpName('C0017.MP4'))
ok('Hook 1.mov → NOT raw', !isRawDumpName('Hook 1.mov'))

// — hasRoleToken
ok('"LGR Video 1 Body.mov" has role token', hasRoleToken('LGR Video 1 Body.mov'))
ok('"H1.mp4" has role token', hasRoleToken('H1.mp4'))
ok('"Audience callout 2.mp4" has role token', hasRoleToken('Audience callout 2.mp4'))
ok('"Glenesk CTA\'s!.mov" has role token', hasRoleToken("Glenesk CTA's!.mov"))
ok('"open day hook.mov" has role token (named)', hasRoleToken('open day hook.mov'))
ok('"W&A Care Script.pdf" has role token (docExt)', hasRoleToken('W&A Care Script.pdf'))
ok('"Nested Sequence 247.mp4" has NO role token', !hasRoleToken('Nested Sequence 247.mp4'))
ok('"DSC0419.MOV" has NO role token', !hasRoleToken('DSC0419.MOV'))

// — isVideo
ok('mov is video', isVideo('clip.mov'))
ok('MP4 is video (case-insensitive)', isVideo('clip.MP4'))
ok('pdf is NOT video', !isVideo('script.pdf'))

// — classifyFolder verdicts -----------------------------------------------

// 1. EMPTY
{
    const f = mkFolder('empty', [])
    const v = classifyFolder(f)
    ok('empty folder → EMPTY', v.class === 'EMPTY' && v.organizedScore === 0)
}

// 2. SOURCE_BUCKET shortcut
{
    const f = mkFolder('B-Roll', [mkFile('clip1.mp4'), mkFile('clip2.mp4')])
    const v = classifyFolder(f)
    ok('B-Roll folder → SOURCE_BUCKET', v.class === 'SOURCE_BUCKET')
}

// 3. ORGANIZED — 5/5 carry role token
{
    const f = mkFolder('Video 1', [
        mkFile('H1.mp4'),
        mkFile('H2.mp4'),
        mkFile('H3.mp4'),
        mkFile('Body 1.mp4'),
        mkFile('CTA 20 seconds.mp4'),
    ])
    const v = classifyFolder(f)
    ok('OBJ "Video 1" (all role-tokened) → ORGANIZED',
        v.class === 'ORGANIZED' && v.organizedScore >= 0.5,
        `class=${v.class} score=${v.organizedScore}`)
}

// 4. RAW_DUMP — only raw-style names
{
    const f = mkFolder('Random raw', [
        mkFile('Nested Sequence 100.mp4'),
        mkFile('Nested Sequence 101.mp4'),
        mkFile('Nested Sequence 102.mp4'),
        mkFile('DSC0419.MOV'),
    ])
    const v = classifyFolder(f)
    ok('raw-dump folder → RAW_DUMP',
        v.class === 'RAW_DUMP',
        `class=${v.class} score=${v.organizedScore}`)
}

// 5. MIXED — 2 hook + 8 raw → organized=0.2, raw=0.8 → RAW_DUMP (not MIXED)
{
    const f = mkFolder('Mixed folder', [
        mkFile('Hook 1.mp4'),
        mkFile('Hook 2.mp4'),
        mkFile('Nested Sequence 100.mp4'),
        mkFile('Nested Sequence 101.mp4'),
        mkFile('Nested Sequence 102.mp4'),
        mkFile('Nested Sequence 103.mp4'),
        mkFile('Nested Sequence 104.mp4'),
        mkFile('Nested Sequence 105.mp4'),
        mkFile('Nested Sequence 106.mp4'),
        mkFile('Nested Sequence 107.mp4'),
    ])
    const v = classifyFolder(f)
    ok('2 role + 8 raw → RAW_DUMP (raw≥0.6)',
        v.class === 'RAW_DUMP',
        `class=${v.class} score=${v.organizedScore}`)
}

// 6. MIXED — exact mix below both thresholds
{
    const f = mkFolder('Mixed folder', [
        mkFile('Hook 1.mp4'),         // role token
        mkFile('clip-random.mp4'),    // unknown
        mkFile('Nested Sequence 100.mp4'),  // raw
    ])
    const v = classifyFolder(f)
    ok('1 role + 1 unknown + 1 raw → MIXED',
        v.class === 'MIXED',
        `class=${v.class} score=${v.organizedScore}`)
}

// 7. Direct children only — subfolder videos don't count
{
    const f = mkFolder('parent', [
        mkFile('Hook 1.mp4'),  // 1 video direct
        mkFolder('subfolder', [
            mkFile('Nested Sequence 200.mp4'),
            mkFile('Nested Sequence 201.mp4'),
        ]),
    ])
    const v = classifyFolder(f)
    ok('subfolder videos ignored by direct triage',
        v.class === 'ORGANIZED' && v.organizedScore === 1,
        `class=${v.class} score=${v.organizedScore}`)
}

// — classifyTree walks recursively
{
    const root: ScanInputNode[] = [
        mkFolder('Video 1', [
            mkFile('H1.mp4'), mkFile('H2.mp4'), mkFile('Body 1.mp4'),
        ]),
        mkFolder('B-Roll', [mkFile('clip1.mp4'), mkFile('clip2.mp4')]),
        mkFolder('Empty', []),
    ]
    const entries = classifyTree(root)
    const byPath = new Map(entries.map(e => [e.pathFromRoot, e.verdict.class]))
    ok('classifyTree finds Video 1 → ORGANIZED', byPath.get('Video 1') === 'ORGANIZED')
    ok('classifyTree finds B-Roll → SOURCE_BUCKET', byPath.get('B-Roll') === 'SOURCE_BUCKET')
    ok('classifyTree finds Empty → EMPTY', byPath.get('Empty') === 'EMPTY')
}

// — dominantClass
ok('dominant picks ORGANIZED over RAW_DUMP',
    dominantClass(['RAW_DUMP', 'ORGANIZED', 'EMPTY']) === 'ORGANIZED')
ok('dominant picks MIXED over RAW_DUMP',
    dominantClass(['RAW_DUMP', 'MIXED']) === 'MIXED')
ok('dominant of all EMPTY = EMPTY',
    dominantClass(['EMPTY', 'EMPTY']) === 'EMPTY')

console.log(`\n=== ${pass} passed · ${fail} failed ===`)
if (fail > 0) process.exit(1)
