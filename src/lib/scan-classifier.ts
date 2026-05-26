/**
 * [Velox Deep Scan v3.1 — classifier]
 *
 * Pure classifier that consumes a recursive scan tree (from cloud-scanner.ts
 * `recursiveScanFolder`) and returns ScanResultV3 — pattern detection, main
 * items, broll structure, shared assets, briefing docs + diagnostics.
 *
 * Spec reference: `VELOX-DEEP-SCAN.md` v3.1 section 4 (5-phase algorithm).
 *
 * **PR1 scope** — Phase 0 (wrapper detect) + Phase 1 (inventory) + Phase 2
 * (subfolder 7-dim classifier). Phase 3-5 stubbed (mainItems = root video
 * files as singleton tasks, no pattern recognition, default P1). PR2 will
 * fill in pattern detection.
 */

import type {
    FileEntry,
    SubfolderProfile,
    SubfolderRole,
    ScanResultV3,
    ScanDiagnosticsV3,
    MainItem,
    BriefingDoc,
    PrimaryPattern,
} from './velox-helpers'
import {
    isVideoFile,
    isAudioFile,
    isImageFile,
    isDocumentFile,
    getBriefingDocType,
    detectBrollVariant,
    scoreSubfolder,
    classifySubfolderFromScores,
    extractPerVideoTag,
    RX_WRAPPER_FOLDER_HINT,
    RX_BRIEFING_KEYWORD,
} from './scan-classifier-helpers'
import type { ScannedVideo } from './cloud-scanner'

/* ════════════════════════════════════════════════════════════════════════ */
/*  Input shape — what cloud-scanner.recursiveScanFolder returns            */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Raw scan tree from cloud-scanner. Each level has files + subfolders.
 * Depth-limited by the scanner itself (cap 4).
 */
export interface RawScanTree {
    /** Original URL user pasted */
    originalUrl: string
    /** Effective root after URL parsing (= path inside cloud storage) */
    rootPath: string
    /** Provider-specific URL for the root folder (shared link or folder URL) */
    rootUrl: string
    /** Files directly at the root (depth 0) */
    rootFiles: FileEntry[]
    /** Subfolders at root (depth 1+, each has its own recursive tree) */
    rootSubfolders: RawScanSubfolder[]
    /** Files dropped because depth > maxDepth */
    ignoredDeepFiles: string[]
}

export interface RawScanSubfolder {
    name: string
    fullPath: string
    url: string
    depth: number
    files: FileEntry[]
    subSubfolders: RawScanSubfolder[]
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 0 — Wrapper detection (D5 layered scoring)                        */
/* ════════════════════════════════════════════════════════════════════════ */

interface WrapperConfidenceBreakdown {
    structure: number
    nonVideoFiles: number
    keywordMatch: number
    total: number
}

/**
 * D5 — Layered confidence scoring for wrapper folder detection.
 *
 * Signal 1 (structure):       1 subfolder + few/no root videos
 * Signal 2 (non-video files): PDF/DOC/etc. present at root
 * Signal 3 (keywords):        brief/spec/sow/etc. in filename, or month/Reno Ads in folder name
 *
 * Returns the breakdown — caller decides drill based on total:
 *   total ≥ 6 → confirmed wrapper (auto-drill silently)
 *   total 4-5 → soft wrapper (drill + warning)
 *   total < 4 → not wrapper
 */
export function computeWrapperConfidence(tree: RawScanTree): WrapperConfidenceBreakdown {
    const breakdown: WrapperConfidenceBreakdown = {
        structure: 0,
        nonVideoFiles: 0,
        keywordMatch: 0,
        total: 0,
    }

    const rootSubfolderCount = tree.rootSubfolders.length
    const rootVideoCount = tree.rootFiles.filter((f) => f.isVideo).length
    const rootNonVideoFiles = tree.rootFiles.filter((f) => !f.isVideo)

    // ─── Signal 1: Structure ──────────────────────────────────────
    if (rootSubfolderCount === 1 && rootVideoCount === 0) {
        breakdown.structure += 3
    } else if (rootSubfolderCount === 1 && rootVideoCount < 3) {
        breakdown.structure += 1
    }

    // ─── Signal 2: Non-video files at root ───────────────────────
    if (rootNonVideoFiles.length > 0) {
        breakdown.nonVideoFiles += 2
        // Document MIME boost
        if (rootNonVideoFiles.some((f) => f.isDocument)) {
            breakdown.nonVideoFiles += 3
        }
    }

    // ─── Signal 3: Keyword matching ──────────────────────────────
    if (rootNonVideoFiles.some((f) => RX_BRIEFING_KEYWORD.test(f.name))) {
        breakdown.keywordMatch += 3
    }
    // Outer folder name hint (Reno Ads / month pattern). Use rootPath last segment.
    const lastSegment = tree.rootPath.split('/').filter(Boolean).pop() ?? ''
    if (RX_WRAPPER_FOLDER_HINT.test(lastSegment)) {
        breakdown.keywordMatch += 2
    }

    breakdown.total =
        breakdown.structure + breakdown.nonVideoFiles + breakdown.keywordMatch
    return breakdown
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 1 — Build SubfolderProfile tree from RawScanTree                 */
/* ════════════════════════════════════════════════════════════════════════ */

function buildSubfolderProfile(raw: RawScanSubfolder): SubfolderProfile {
    const videoFiles = raw.files.filter((f) => f.isVideo)
    const audioFiles = raw.files.filter((f) => f.isAudio)
    const imageFiles = raw.files.filter((f) => f.isImage)
    const documentFiles = raw.files.filter((f) => f.isDocument)

    const subProfiles = raw.subSubfolders.map(buildSubfolderProfile)

    // Recursive video count
    const totalVideoCountRecursive =
        videoFiles.length +
        subProfiles.reduce((s, p) => s + p.totalVideoCountRecursive, 0)

    // Phase 2: score + classify
    const scores = scoreSubfolder({
        name: raw.name,
        videoCount: videoFiles.length,
        imageCount: imageFiles.length,
        audioCount: audioFiles.length,
        videoFilenames: videoFiles.map((f) => f.name),
    })
    const classifiedAs = classifySubfolderFromScores(scores)

    const profile: SubfolderProfile = {
        name: raw.name,
        fullPath: raw.fullPath,
        url: raw.url,
        depth: raw.depth,
        videoFiles,
        audioFiles,
        imageFiles,
        documentFiles,
        totalVideoCountRecursive,
        subSubfolders: subProfiles,
        scores,
        classifiedAs,
    }

    // Tag per-video roles with index + prefix
    if (
        classifiedAs === 'per-video-broll' ||
        classifiedAs === 'aroll-pervideo'
    ) {
        const tag = extractPerVideoTag(raw.name)
        if (tag) profile.perVideoTag = tag
    }

    // Tag broll variant
    if (classifiedAs === 'broll' || classifiedAs === 'per-video-broll') {
        profile.brollVariant = detectBrollVariant(raw.name)
    }

    return profile
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 0 + Phase 1 + Phase 2 orchestrator                                */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Run Phase 0 (wrapper detect) and possibly drill into wrapper, then build
 * subfolder profile tree (Phase 1 + Phase 2).
 *
 * Returns:
 *   - effectiveTree: tree after wrapper drill (may be same as input)
 *   - isWrapper, wrapperConfidence, wrapperName
 *   - briefingDocs harvested from outer wrapper (only when isWrapper)
 *   - rootSubfolderProfiles classified
 */
function runPhase0to2(tree: RawScanTree): {
    effectiveTree: RawScanTree
    rootSubfolderProfiles: SubfolderProfile[]
    rootFileEntries: FileEntry[]
    isWrapper: boolean
    wrapperConfidence: number
    wrapperBreakdown: WrapperConfidenceBreakdown
    wrapperName?: string
    briefingDocs: BriefingDoc[]
    warnings: string[]
} {
    const warnings: string[] = []
    const breakdown = computeWrapperConfidence(tree)

    let isWrapper = false
    let effectiveTree = tree
    let wrapperName: string | undefined
    let briefingDocs: BriefingDoc[] = []

    if (breakdown.total >= 4) {
        // Confirmed (≥6) or soft (4-5) wrapper
        isWrapper = true
        wrapperName = tree.rootPath.split('/').filter(Boolean).pop()

        // Harvest briefing docs at outer level
        briefingDocs = tree.rootFiles
            .filter((f) => f.isDocument)
            .map<BriefingDoc>((f) => ({
                type: getBriefingDocType(f.fullName),
                file: f,
            }))

        // Drill into the (single) subfolder. Per spec: max depth 1 — no recurse-of-wrapper.
        if (tree.rootSubfolders.length === 1) {
            const inner = tree.rootSubfolders[0]
            effectiveTree = {
                originalUrl: tree.originalUrl,
                rootPath: inner.fullPath,
                rootUrl: inner.url,
                rootFiles: inner.files,
                rootSubfolders: inner.subSubfolders,
                ignoredDeepFiles: tree.ignoredDeepFiles,
            }

            if (breakdown.total < 6) {
                warnings.push(
                    `Có thể là wrapper folder (confidence ${breakdown.total}/10), đã tự động drill vào "${inner.name}" — undo nếu sai.`,
                )
            }
        } else {
            // Edge case: scored as wrapper but multiple subfolders — don't drill
            isWrapper = false
            warnings.push(
                `Folder gốc có dấu hiệu wrapper nhưng có ${tree.rootSubfolders.length} subfolder — bỏ qua auto-drill.`,
            )
        }
    }

    // Build profile tree (Phase 1 + Phase 2)
    const rootSubfolderProfiles = effectiveTree.rootSubfolders.map(buildSubfolderProfile)

    return {
        effectiveTree,
        rootSubfolderProfiles,
        rootFileEntries: effectiveTree.rootFiles,
        isWrapper,
        wrapperConfidence: breakdown.total,
        wrapperBreakdown: breakdown,
        wrapperName,
        briefingDocs,
        warnings,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  PR1 stub — Phase 3-5 will be implemented in PR2                         */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Stub MainItem builder for PR1: treat every root video file as a singleton
 * task. Phase 4 pairing + Phase 5 pattern detection will replace this in PR2.
 */
function buildStubMainItems(rootVideoFiles: FileEntry[]): MainItem[] {
    return rootVideoFiles.map<MainItem>((f) => ({
        kind: 'file',
        taskName: f.name,
        taskNameByMode: { A: f.name, B: f.name, C: f.name },
        defaultTaskNameMode: 'A',
        previewUrl: f.previewUrl,
        durationSeconds: f.durationSeconds,
        sourceLabel: '📹 Single file',
        file: f,
    }))
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Diagnostic summary builder                                              */
/* ════════════════════════════════════════════════════════════════════════ */

function summarizeSubfolderScores(
    profiles: SubfolderProfile[],
): ScanDiagnosticsV3['subfolderScores'] {
    const out: ScanDiagnosticsV3['subfolderScores'] = []

    function walk(p: SubfolderProfile) {
        out.push({
            name: p.name,
            depth: p.depth,
            scores: p.scores,
            classifiedAs: p.classifiedAs,
            perVideoTag: p.perVideoTag,
        })
        for (const sub of p.subSubfolders) walk(sub)
    }
    for (const p of profiles) walk(p)
    return out
}

function countSubfolders(profiles: SubfolderProfile[]): number {
    let count = 0
    function walk(p: SubfolderProfile) {
        count++
        for (const sub of p.subSubfolders) walk(sub)
    }
    for (const p of profiles) walk(p)
    return count
}

function countRecursiveVideos(
    rootFiles: FileEntry[],
    profiles: SubfolderProfile[],
): number {
    const rootCount = rootFiles.filter((f) => f.isVideo).length
    const subCount = profiles.reduce((s, p) => s + p.totalVideoCountRecursive, 0)
    return rootCount + subCount
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Convert MainItem → V1 ScannedVideo (backward compat)                   */
/* ════════════════════════════════════════════════════════════════════════ */

function mainItemsToV1Videos(items: MainItem[]): ScannedVideo[] {
    return items.map<ScannedVideo>((m) => {
        if (m.kind === 'file') {
            return {
                name: m.file.name,
                fullName: m.file.fullName,
                durationSeconds: m.durationSeconds,
                sizeBytes: m.file.sizeBytes,
                previewUrl: m.previewUrl,
                path: m.file.parentFolderPath,
                fileId: m.file.fileId,
            }
        }
        if (m.kind === 'pair') {
            const canonical = m.body ?? m.hooks
            return {
                name: m.taskName,
                fullName: canonical?.fullName ?? m.taskName,
                durationSeconds: m.durationSeconds,
                sizeBytes: canonical?.sizeBytes ?? 0,
                previewUrl: m.previewUrl,
                path: canonical?.parentFolderPath ?? '',
                fileId: canonical?.fileId ?? m.basePart,
            }
        }
        // folder-bundle
        return {
            name: m.taskName,
            fullName: m.folder.name,
            durationSeconds: 0,
            sizeBytes: 0,
            previewUrl: m.previewUrl,
            path: m.folder.fullPath,
            fileId: m.folder.url,
        }
    })
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Main entry: classifyScan                                                */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Run all phases (currently 0-2 in PR1, will add 3-5 in PR2) and return
 * ScanResultV3.
 */
export function classifyScan(tree: RawScanTree): ScanResultV3 {
    const phase02 = runPhase0to2(tree)

    // Phase 3-5 stub (PR1): every root video → singleton task
    const rootVideoFiles = phase02.rootFileEntries.filter((f) => f.isVideo)
    const mainItems = buildStubMainItems(rootVideoFiles)

    // Primary pattern stub — PR2 will compute properly
    const primaryPattern: PrimaryPattern = 'P1'

    const diagnostics: ScanDiagnosticsV3 = {
        isWrapper: phase02.isWrapper,
        wrapperName: phase02.wrapperName,
        wrapperConfidenceBreakdown: phase02.wrapperBreakdown,
        effectiveRootUrl: phase02.effectiveTree.rootUrl,
        patternDetectionRationale:
            'PR1 stub — Phase 3-5 chưa implement. Mọi root video file → 1 task. Pattern recognition sẽ có ở PR2.',
        totalVideoCountRecursive: countRecursiveVideos(
            phase02.effectiveTree.rootFiles,
            phase02.rootSubfolderProfiles,
        ),
        totalSubfolderCount: countSubfolders(phase02.rootSubfolderProfiles),
        ignoredDeepFiles: phase02.effectiveTree.ignoredDeepFiles,
        subfolderScores: summarizeSubfolderScores(phase02.rootSubfolderProfiles),
    }

    return {
        videos: mainItemsToV1Videos(mainItems),
        primaryPattern,
        isWrapper: phase02.isWrapper,
        wrapperConfidence: phase02.wrapperConfidence,
        confidence: 0.5, // PR2 will compute properly
        mainItems,
        broll: null,
        brollMatchPolicy: 'NONE',
        sharedAssets: [],
        briefingDocs: phase02.briefingDocs,
        warnings: phase02.warnings,
        diagnostics,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Re-exported helpers (used by API route to build FileEntry)              */
/* ════════════════════════════════════════════════════════════════════════ */

export { isVideoFile, isAudioFile, isImageFile, isDocumentFile }
