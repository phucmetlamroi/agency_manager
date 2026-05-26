/**
 * [Velox Deep Scan v3.1 — PR4 tests]
 *
 * Lightweight test script for scan-classifier — runs synthetic fixtures
 * through classifyScan() and asserts pattern detection + D-decision behavior.
 *
 * Run: `npx tsx scripts/test-scan-classifier.ts`
 *
 * No jest dependency — uses simple assertion helper.
 */

import { classifyScan, type RawScanTree, type RawScanSubfolder } from '../src/lib/scan-classifier'
import {
    parseFilenameForPairing,
    groupByBasePart,
    resolveTaskNameByMode,
    scoreSubfolder,
    classifySubfolderFromScores,
    computeCameraDumpRatio,
} from '../src/lib/scan-classifier-helpers'
import {
    encodeResourcesV3,
    maybeAppendBriefToNotes,
    type FileEntry,
    type MainItem,
} from '../src/lib/velox-helpers'

/* ════════════════════════════════════════════════════════════════════════ */
/*  Assertion helper                                                        */
/* ════════════════════════════════════════════════════════════════════════ */

let passed = 0
let failed = 0
const failures: string[] = []

function test(name: string, fn: () => void) {
    try {
        fn()
        passed++
        console.log(`  ✓ ${name}`)
    } catch (err: any) {
        failed++
        const msg = `  ✗ ${name}\n      ${err?.message ?? String(err)}`
        failures.push(msg)
        console.log(msg)
    }
}

function expect(actual: any, expected: any, label: string) {
    const a = JSON.stringify(actual)
    const b = JSON.stringify(expected)
    if (a !== b) {
        throw new Error(`${label}\n      Expected: ${b}\n      Actual:   ${a}`)
    }
}

function expectTruthy(value: any, label: string) {
    if (!value) throw new Error(`${label} — got falsy: ${value}`)
}

function expectGte(actual: number, expected: number, label: string) {
    if (actual < expected) {
        throw new Error(`${label} — Expected ≥ ${expected}, got ${actual}`)
    }
}

function group(name: string, fn: () => void) {
    console.log(`\n## ${name}`)
    fn()
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Synthetic FileEntry helpers                                             */
/* ════════════════════════════════════════════════════════════════════════ */

function file(opts: {
    name: string
    duration?: number
    sizeBytes?: number
    mimeType?: string
    depth?: number
}): FileEntry {
    const fullName = opts.name
    const dotIdx = fullName.lastIndexOf('.')
    const name = dotIdx > 0 ? fullName.slice(0, dotIdx) : fullName
    const ext = dotIdx > 0 ? fullName.slice(dotIdx).toLowerCase() : ''
    const isVideo = ['.mp4', '.mov', '.avi', '.mkv', '.webm'].includes(ext)
    const isImage = ['.jpg', '.jpeg', '.png', '.gif'].includes(ext)
    const isAudio = ['.mp3', '.wav', '.aac'].includes(ext)
    const isDoc = ['.pdf', '.doc', '.docx', '.pptx', '.txt', '.rtf'].includes(ext)
    return {
        fileId: `id-${fullName}`,
        name,
        fullName,
        mimeType: opts.mimeType ?? (isVideo ? 'video/mp4' : isImage ? 'image/jpeg' : isAudio ? 'audio/mp3' : isDoc ? 'application/pdf' : 'application/octet-stream'),
        durationSeconds: opts.duration ?? (isVideo ? 60 : 0),
        sizeBytes: opts.sizeBytes ?? 1024,
        previewUrl: `https://example.com/${encodeURIComponent(fullName)}`,
        isVideo,
        isAudio,
        isImage,
        isDocument: isDoc,
        depth: opts.depth ?? 0,
        parentFolderName: '',
        parentFolderPath: '',
    }
}

function folder(name: string, depth: number, files: FileEntry[], subs: RawScanSubfolder[] = []): RawScanSubfolder {
    return {
        name,
        fullPath: `/${name}`,
        url: `https://example.com/folder/${encodeURIComponent(name)}`,
        depth,
        files,
        subSubfolders: subs,
    }
}

function tree(rootFiles: FileEntry[], rootSubfolders: RawScanSubfolder[]): RawScanTree {
    return {
        originalUrl: 'https://example.com',
        rootPath: '/root',
        rootUrl: 'https://example.com/root',
        rootFiles,
        rootSubfolders,
        ignoredDeepFiles: [],
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Tests                                                                   */
/* ════════════════════════════════════════════════════════════════════════ */

group('Helpers — pairing parser (D1)', () => {
    test('parses "LGR Video 1 Body.mov" → prefix=LGR, base=Video 1, suffix=body', () => {
        const f = file({ name: 'LGR Video 1 Body.mov' })
        const parsed = parseFilenameForPairing(f)
        expectTruthy(parsed, 'parsed should be non-null')
        expect(parsed!.fullPrefix.trim(), 'LGR', 'fullPrefix')
        expect(parsed!.coreBase.toLowerCase(), 'video 1', 'coreBase')
        expect(parsed!.suffix, 'body', 'suffix')
        expect(parsed!.videoIndex, 1, 'videoIndex')
    })

    test('parses "Video 1.mov" — no prefix', () => {
        const parsed = parseFilenameForPairing(file({ name: 'Video 1.mov' }))
        expectTruthy(parsed, 'parsed non-null')
        expect(parsed!.fullPrefix.trim(), '', 'no prefix')
        expect(parsed!.suffix, '', 'no suffix')
    })

    test('groups files by basePart (case-insensitive)', () => {
        const files = [
            parseFilenameForPairing(file({ name: 'LGR Video 1 Body.mov' }))!,
            parseFilenameForPairing(file({ name: 'LGR Video 1 Hooks.mov' }))!,
            parseFilenameForPairing(file({ name: 'LGR Video 2 Body.mov' }))!,
        ]
        const groups = groupByBasePart(files)
        expect(groups.size, 2, '2 groups expected')
    })

    test('D1 mode A/B/C resolution with prefix', () => {
        const files = [
            parseFilenameForPairing(file({ name: 'LGR Video 1 Body.mov' }))!,
            parseFilenameForPairing(file({ name: 'LGR Video 1 Hooks.mov' }))!,
        ]
        const { taskNameByMode, defaultMode } = resolveTaskNameByMode(files)
        expect(defaultMode, 'B', 'default = B (has prefix)')
        expect(taskNameByMode.A, 'Video 1', 'mode A')
        expect(taskNameByMode.B, 'LGR Video 1', 'mode B')
        expect(taskNameByMode.C, 'LGR Video 1 Body', 'mode C')
    })

    test('D1 mode auto = A when no prefix', () => {
        const files = [
            parseFilenameForPairing(file({ name: 'Video 1 Body.mov' }))!,
            parseFilenameForPairing(file({ name: 'Video 1 Hooks.mov' }))!,
        ]
        const { defaultMode } = resolveTaskNameByMode(files)
        expect(defaultMode, 'A', 'default = A (no prefix)')
    })
})

group('Helpers — subfolder scoring', () => {
    test('"B-Roll" → broll role', () => {
        const scores = scoreSubfolder({
            name: 'B-Roll',
            videoCount: 5,
            imageCount: 0,
            audioCount: 0,
            videoFilenames: ['stock1.mp4', 'stock2.mp4'],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'broll', 'B-Roll classified as broll')
    })

    test('"Video 1 - B-roll" → per-video-broll role', () => {
        const scores = scoreSubfolder({
            name: 'Video 1 - B-roll',
            videoCount: 3,
            imageCount: 0,
            audioCount: 0,
            videoFilenames: ['a.mp4'],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'per-video-broll', 'per-video-broll')
    })

    test('"AD 1" → bundle role', () => {
        const scores = scoreSubfolder({
            name: 'AD 1',
            videoCount: 6,
            imageCount: 0,
            audioCount: 1,
            videoFilenames: ['20260520_a7s30726_001.mp4', '20260520_a7s30726_002.mp4'],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'bundle', 'AD 1 classified as bundle')
    })

    test('"Videos & Hooks" → output-container', () => {
        const scores = scoreSubfolder({
            name: 'Videos & Hooks',
            videoCount: 8,
            imageCount: 0,
            audioCount: 0,
            videoFilenames: [
                'Barmoor Video 1.mov',
                'Barmoor Video 1 Hooks.mov',
                'Barmoor Video 2.mov',
                'Barmoor Video 2 Hooks.mov',
            ],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'output-container', 'output-container')
    })

    test('"A-ROLL" → aroll-shared', () => {
        const scores = scoreSubfolder({
            name: 'A-ROLL',
            videoCount: 12,
            imageCount: 0,
            audioCount: 0,
            videoFilenames: [],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'aroll-shared', 'aroll-shared')
    })

    test('"Video 1 A Roll" → aroll-pervideo', () => {
        const scores = scoreSubfolder({
            name: 'Video 1 A Roll',
            videoCount: 5,
            imageCount: 0,
            audioCount: 0,
            videoFilenames: [],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'aroll-pervideo', 'aroll-pervideo')
    })

    test('"Images" → images role', () => {
        const scores = scoreSubfolder({
            name: 'Images',
            videoCount: 0,
            imageCount: 10,
            audioCount: 0,
            videoFilenames: [],
        })
        const role = classifySubfolderFromScores(scores)
        expect(role, 'images', 'images')
    })
})

group('D6 — Camera-dump ratio (P7 gate)', () => {
    test('30 DJI files → ratio 1.0 (above 0.5 threshold)', () => {
        const filenames = Array.from({ length: 30 }, (_, i) => `DJI_2026042811${i}.mp4`)
        const ratio = computeCameraDumpRatio(filenames)
        expectGte(ratio, 0.5, 'ratio ≥ 0.5')
    })

    test('mixed DJI + main → ratio below 0.5 (does NOT trigger P7)', () => {
        const filenames = [
            'A1 Video 1 Body.mov',
            'A1 Video 1 Hooks.mov',
            'A1 Video 2.mov',
            'A1 Video 2 Hooks.mov',
            'DJI_001.mp4',
            'DJI_002.mp4',
        ]
        const ratio = computeCameraDumpRatio(filenames)
        if (ratio >= 0.5) {
            throw new Error(`Expected ratio < 0.5, got ${ratio}`)
        }
    })
})

group('classifyScan — synthetic patterns', () => {
    test('Flat scan (P1) — 3 root videos no Video N naming, no folders', () => {
        // Use generic names that DON'T match RX_VIDEO_N so we get P1 fallback,
        // not P2 fallback (clean naming branch).
        const t = tree(
            [
                file({ name: 'interview.mp4', duration: 60 }),
                file({ name: 'testimonial.mp4', duration: 90 }),
                file({ name: 'closing.mp4', duration: 30 }),
            ],
            [],
        )
        const result = classifyScan(t)
        expect(result.primaryPattern, 'P1', 'P1 pattern')
        expect(result.mainItems.length, 3, '3 main items')
    })

    test('P2 — Body+Hooks pair detection', () => {
        const t = tree(
            [
                file({ name: 'LGR Video 1 Body.mov', duration: 120 }),
                file({ name: 'LGR Video 1 Hooks.mov', duration: 60 }),
                file({ name: 'LGR Video 2 Body.mov', duration: 100 }),
                file({ name: 'LGR Video 2 Hooks.mov', duration: 50 }),
            ],
            [],
        )
        const result = classifyScan(t)
        expect(result.primaryPattern, 'P2', 'P2 pattern')
        expect(result.mainItems.length, 2, '2 pair tasks')
        const firstPair = result.mainItems[0]
        expectTruthy(firstPair.kind === 'pair', 'first item is pair')
        if (firstPair.kind === 'pair') {
            expect(firstPair.taskNameByMode.B, 'LGR Video 1', 'mode B taskname')
            expect(firstPair.defaultTaskNameMode, 'B', 'default mode B (has prefix)')
        }
    })

    test('P3 — Bundle folders, no root videos', () => {
        const t = tree(
            [],
            [
                folder('AD 1', 1, [
                    file({ name: 'clip1.mp4', duration: 5 }),
                    file({ name: 'clip2.mp4', duration: 5 }),
                    file({ name: 'clip3.mp4', duration: 5 }),
                ]),
                folder('AD 2', 1, [
                    file({ name: 'clip1.mp4', duration: 5 }),
                    file({ name: 'clip2.mp4', duration: 5 }),
                    file({ name: 'clip3.mp4', duration: 5 }),
                ]),
                folder('B-Roll', 1, [
                    file({ name: 'broll1.mp4', duration: 10 }),
                ]),
            ],
        )
        const result = classifyScan(t)
        expect(result.primaryPattern, 'P3', 'P3 pattern')
        expect(result.mainItems.length, 2, '2 bundle tasks')
        expect(result.mainItems[0].kind, 'folder-bundle', 'bundle kind')
    })

    test('D5 — Wrapper detection (PDF + 1 inner folder)', () => {
        const t = tree(
            [
                file({ name: 'Reno Ads - May 2026.pdf' }),
            ],
            [
                folder('Inner Content', 1, [
                    file({ name: 'AD 1.mp4', duration: 30 }),
                ]),
            ],
        )
        // Path should hint at wrapper
        t.rootPath = '/12. Align West Homes Reno'
        const result = classifyScan(t)
        expectTruthy(result.isWrapper, 'isWrapper should be true')
        expectGte(result.wrapperConfidence, 4, 'wrapperConfidence ≥ 4')
        expect(result.briefingDocs.length, 1, '1 briefing doc')
    })

    test('D2 — PENDING when both general + per-video broll exist', () => {
        const t = tree(
            [
                file({ name: 'A1 Video 1 Body.mov', duration: 60 }),
                file({ name: 'A1 Video 1 Hooks.mov', duration: 30 }),
            ],
            [
                folder('General B-Roll', 1, [file({ name: 'b1.mp4', duration: 5 })]),
                folder('Video 1 - B-roll', 1, [file({ name: 'b2.mp4', duration: 5 })]),
            ],
        )
        const result = classifyScan(t)
        expect(result.brollMatchPolicy, 'PENDING_USER_CONFIRM', 'PENDING when both exist')
    })

    test('D2 — GENERAL_ONLY when only general broll', () => {
        const t = tree(
            [
                file({ name: 'Video 1.mp4', duration: 60 }),
            ],
            [
                folder('B-Roll', 1, [file({ name: 'b1.mp4', duration: 5 })]),
            ],
        )
        const result = classifyScan(t)
        expect(result.brollMatchPolicy, 'GENERAL_ONLY', 'GENERAL_ONLY')
    })
})

group('encodeResourcesV3 (D3)', () => {
    test('Single file MainItem → RAW only', () => {
        const f = file({ name: 'video1.mp4' })
        const m: MainItem = {
            kind: 'file',
            taskName: 'video1',
            taskNameByMode: { A: 'video1', B: 'video1', C: 'video1' },
            defaultTaskNameMode: 'A',
            previewUrl: f.previewUrl,
            durationSeconds: 60,
            sourceLabel: '📹 Single',
            file: f,
        }
        const encoded = encodeResourcesV3({
            mainItem: m,
            broll: null,
            brollPolicy: 'NONE',
            sharedAssets: [],
            briefingDocs: [],
        })
        expectTruthy(encoded.startsWith('RAW: '), 'starts with RAW:')
        expectTruthy(!encoded.includes('RAW_HOOKS'), 'no RAW_HOOKS for single')
    })

    test('Pair MainItem → RAW + RAW_HOOKS', () => {
        const body = file({ name: 'LGR Video 1 Body.mov' })
        const hooks = file({ name: 'LGR Video 1 Hooks.mov' })
        const m: MainItem = {
            kind: 'pair',
            taskName: 'LGR Video 1',
            taskNameByMode: { A: 'Video 1', B: 'LGR Video 1', C: 'LGR Video 1 Body' },
            defaultTaskNameMode: 'B',
            previewUrl: body.previewUrl,
            durationSeconds: 120,
            sourceLabel: '🎬 Body + Hooks',
            basePart: 'LGR Video 1',
            body,
            hooks,
            extras: [],
            additionalUrls: [hooks.previewUrl],
        }
        const encoded = encodeResourcesV3({
            mainItem: m,
            broll: null,
            brollPolicy: 'NONE',
            sharedAssets: [],
            briefingDocs: [],
        })
        expectTruthy(encoded.includes('RAW:'), 'has RAW:')
        expectTruthy(encoded.includes('RAW_HOOKS:'), 'has RAW_HOOKS:')
    })

    test('Shared CTA appended', () => {
        const f = file({ name: 'video1.mp4' })
        const cta = file({ name: 'Main CTA.mp4' })
        const m: MainItem = {
            kind: 'file',
            taskName: 'video1',
            taskNameByMode: { A: 'video1', B: 'video1', C: 'video1' },
            defaultTaskNameMode: 'A',
            previewUrl: f.previewUrl,
            durationSeconds: 60,
            sourceLabel: '📹',
            file: f,
        }
        const encoded = encodeResourcesV3({
            mainItem: m,
            broll: null,
            brollPolicy: 'NONE',
            sharedAssets: [{ type: 'cta', file: cta }],
            briefingDocs: [],
        })
        expectTruthy(encoded.includes('SHARED_CTA:'), 'has SHARED_CTA')
    })

    test('Brief URL appended', () => {
        const f = file({ name: 'video1.mp4' })
        const brief = file({ name: 'Brief.pdf' })
        const m: MainItem = {
            kind: 'file',
            taskName: 'video1',
            taskNameByMode: { A: 'video1', B: 'video1', C: 'video1' },
            defaultTaskNameMode: 'A',
            previewUrl: f.previewUrl,
            durationSeconds: 60,
            sourceLabel: '📹',
            file: f,
        }
        const encoded = encodeResourcesV3({
            mainItem: m,
            broll: null,
            brollPolicy: 'NONE',
            sharedAssets: [],
            briefingDocs: [{ type: 'pdf', file: brief }],
        })
        expectTruthy(encoded.includes('BRIEF:'), 'has BRIEF')
    })
})

group('maybeAppendBriefToNotes (D4)', () => {
    test('Toggle OFF → no change', () => {
        const before = '<p>Original</p>'
        const brief = file({ name: 'Brief.pdf' })
        const result = maybeAppendBriefToNotes(before, [{ type: 'pdf', file: brief }], false)
        expect(result, before, 'unchanged when toggle off')
    })

    test('Toggle ON + empty notes → set brief block', () => {
        const result = maybeAppendBriefToNotes('', [{ type: 'pdf', file: file({ name: 'B.pdf' }) }], true)
        expectTruthy(result.includes('[Brief đính kèm]'), 'has marker')
        expectTruthy(result.includes('B.pdf'), 'has filename')
    })

    test('Toggle ON + notes has content → append với 2 newline', () => {
        const result = maybeAppendBriefToNotes('Existing', [{ type: 'pdf', file: file({ name: 'B.pdf' }) }], true)
        expectTruthy(result.startsWith('Existing'), 'preserves existing')
        expectTruthy(result.includes('\n\n[Brief đính kèm]'), '2 newline separator')
    })

    test('Idempotent — re-append skips when marker already there', () => {
        const first = maybeAppendBriefToNotes('Note', [{ type: 'pdf', file: file({ name: 'B.pdf' }) }], true)
        const second = maybeAppendBriefToNotes(first, [{ type: 'pdf', file: file({ name: 'B.pdf' }) }], true)
        expect(first, second, 'second call no-op')
    })
})

/* ════════════════════════════════════════════════════════════════════════ */
/*  Summary                                                                 */
/* ════════════════════════════════════════════════════════════════════════ */

console.log(`\n${'━'.repeat(60)}`)
console.log(`Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`)
if (failed > 0) {
    console.log('\nFailures:')
    for (const f of failures) console.log(f)
    process.exit(1)
}
console.log('✓ All tests passed')
