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
    MainItemFile,
    MainItemPair,
    MainItemFolderBundle,
    BriefingDoc,
    ScriptDoc,
    PrimaryPattern,
    BrollV3,
    BrollFolder,
    PerVideoBrollFolder,
    SharedAsset,
    BrollMatchPolicy,
    BrollVariant,
    TaskNameMode,
} from './velox-helpers'
import {
    isVideoFile,
    isAudioFile,
    isImageFile,
    isDocumentFile,
    getBriefingDocType,
    getScriptDocType,
    isScriptDoc,
    isSubtitleFile,
    detectBrollVariant,
    scoreSubfolder,
    classifySubfolderFromScores,
    extractPerVideoTag,
    scoreRootFile,
    classifyRootFile,
    parseFilenameForPairing,
    groupByBasePart,
    resolveTaskNameByMode,
    detectSharedAssetType,
    detectBatchPrefix,
    computeCameraDumpRatio,
    RX_VIDEO_N,
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
/**
 * Split document/subtitle files into briefs vs scripts.
 *
 * Logic priority:
 *  1. Docs với script keyword (script/transcript/caption/sub/subtitle/dialog) → scripts
 *  2. Remaining docs (PDF/DOC/DOCX/TXT/RTF không match script keyword) → briefs
 *  3. .srt / .vtt subtitle files → FALLBACK script (chỉ khi không có script-keyword doc)
 *
 * Subtitle là sub file. Nếu khách có sẵn file tên 'script.docx' → dùng đó làm
 * script, sub bị ignore. Nếu không có script-named doc nhưng có .srt → .srt
 * lấp chỗ trống làm script.
 */
function splitDocsIntoBriefsAndScripts(files: FileEntry[]): {
    briefs: BriefingDoc[]
    scripts: ScriptDoc[]
} {
    const briefs: BriefingDoc[] = []
    const scripts: ScriptDoc[] = []
    const subtitleCandidates: FileEntry[] = []

    for (const f of files) {
        if (isSubtitleFile(f.fullName)) {
            subtitleCandidates.push(f)
            continue
        }
        if (!f.isDocument) continue
        if (isScriptDoc(f.fullName)) {
            scripts.push({ type: getScriptDocType(f.fullName), file: f })
        } else {
            briefs.push({ type: getBriefingDocType(f.fullName), file: f })
        }
    }

    // Fallback — nếu không có doc nào tên là script, subtitle files (.srt/.vtt)
    // được promote thành script. Cover case khách cung cấp file phụ đề thay vì
    // tài liệu script chính thức.
    if (scripts.length === 0 && subtitleCandidates.length > 0) {
        for (const sub of subtitleCandidates) {
            scripts.push({ type: getScriptDocType(sub.fullName), file: sub })
        }
    }

    return { briefs, scripts }
}

function runPhase0to2(tree: RawScanTree): {
    effectiveTree: RawScanTree
    rootSubfolderProfiles: SubfolderProfile[]
    rootFileEntries: FileEntry[]
    isWrapper: boolean
    wrapperConfidence: number
    wrapperBreakdown: WrapperConfidenceBreakdown
    wrapperName?: string
    briefingDocs: BriefingDoc[]
    scriptDocs: ScriptDoc[]
    warnings: string[]
} {
    const warnings: string[] = []
    const breakdown = computeWrapperConfidence(tree)

    let isWrapper = false
    let effectiveTree = tree
    let wrapperName: string | undefined
    let briefingDocs: BriefingDoc[] = []
    let scriptDocs: ScriptDoc[] = []

    if (breakdown.total >= 4) {
        // Confirmed (≥6) or soft (4-5) wrapper
        isWrapper = true
        wrapperName = tree.rootPath.split('/').filter(Boolean).pop()

        // Harvest brief + script docs at outer level (split by keyword)
        const split = splitDocsIntoBriefsAndScripts(tree.rootFiles)
        briefingDocs = split.briefs
        scriptDocs = split.scripts

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

    // ALSO scan effective root level for brief/script docs (whether wrapper
    // drilled or not). Script + brief can be at any level.
    const innerSplit = splitDocsIntoBriefsAndScripts(effectiveTree.rootFiles)
    briefingDocs = [...briefingDocs, ...innerSplit.briefs]
    scriptDocs = [...scriptDocs, ...innerSplit.scripts]

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
        scriptDocs,
        warnings,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 3 — Root file classifier                                          */
/* ════════════════════════════════════════════════════════════════════════ */

interface RootFileClassification {
    mainFiles: FileEntry[]
    brollLooseFiles: FileEntry[]
    sharedAssetFiles: Array<{ file: FileEntry; type: ReturnType<typeof detectSharedAssetType> }>
    /** Per-file diagnostics (Phase 3 scores) */
    fileScores: ScanDiagnosticsV3['fileScores']
}

function classifyRootFiles(rootVideoFiles: FileEntry[]): RootFileClassification {
    const mainFiles: FileEntry[] = []
    const brollLooseFiles: FileEntry[] = []
    const sharedAssetFiles: RootFileClassification['sharedAssetFiles'] = []
    const fileScores: ScanDiagnosticsV3['fileScores'] = []

    for (const file of rootVideoFiles) {
        const scores = scoreRootFile({
            name: file.name,
            fullName: file.fullName,
            durationSeconds: file.durationSeconds,
        })
        const { classifiedAs } = classifyRootFile(scores)

        fileScores!.push({ name: file.name, scores, classifiedAs })

        if (classifiedAs === 'broll') {
            brollLooseFiles.push(file)
        } else if (classifiedAs === 'shared_asset') {
            sharedAssetFiles.push({ file, type: detectSharedAssetType(file.name) })
        } else {
            // 'main' or 'ambiguous' (defaults to main per classifyRootFile)
            mainFiles.push(file)
        }
    }

    return { mainFiles, brollLooseFiles, sharedAssetFiles, fileScores }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 4 — Pairing detector with D1 3-mode taskName                      */
/* ════════════════════════════════════════════════════════════════════════ */

interface PairingResult {
    mainItems: MainItem[]
    pairingGroups: ScanDiagnosticsV3['pairingGroups']
    /** Files that couldn't be parsed into pairing → fallback singleton */
    unpaired: FileEntry[]
    /** Did at least 1 group contain both body + hooks? Drives `hasPairing` signal. */
    hasPairing: boolean
}

function buildPairedMainItems(mainFiles: FileEntry[]): PairingResult {
    const parsed = mainFiles
        .map(parseFilenameForPairing)
        .filter((p): p is NonNullable<typeof p> => p !== null)

    const unparsedFiles = mainFiles.filter(
        (f) => !parsed.some((p) => p.file.fileId === f.fileId),
    )

    const groups = groupByBasePart(parsed)
    const mainItems: MainItem[] = []
    const pairingGroups: ScanDiagnosticsV3['pairingGroups'] = []
    let hasPairing = false

    for (const group of groups.values()) {
        const body = group.find(
            (p) => p.suffix === 'body' || p.suffix === 'main' || p.suffix === '',
        )
        const hooks = group.find((p) => p.suffix === 'hooks')
        const extras = group.filter(
            (p) =>
                p.suffix !== 'body' &&
                p.suffix !== 'main' &&
                p.suffix !== '' &&
                p.suffix !== 'hooks',
        )

        const { taskNameByMode, defaultMode } = resolveTaskNameByMode(group)

        pairingGroups!.push({
            basePart: group[0].basePart,
            bodyFile: body?.file.fullName,
            hooksFile: hooks?.file.fullName,
            extras: extras.map((e) => e.file.fullName),
        })

        const canonicalFile = body?.file ?? hooks?.file ?? group[0].file
        const videoIndex = group[0].videoIndex

        if (body && hooks) {
            hasPairing = true
            const item: MainItemPair = {
                kind: 'pair',
                taskName: taskNameByMode[defaultMode],
                taskNameByMode,
                defaultTaskNameMode: defaultMode,
                previewUrl: canonicalFile.previewUrl,
                durationSeconds: canonicalFile.durationSeconds,
                sourceLabel: '🎬 Body + Hooks',
                basePart: group[0].basePart,
                body: body.file,
                hooks: hooks.file,
                extras: extras.map((e) => e.file),
                additionalUrls: [hooks.file.previewUrl, ...extras.map((e) => e.file.previewUrl)],
                videoIndex: videoIndex > 0 ? videoIndex : undefined,
            }
            mainItems.push(item)
        } else if (group.length === 1) {
            // Single file in group — emit as MainItemFile with D1 modes
            const single = group[0]
            const item: MainItemFile = {
                kind: 'file',
                taskName: taskNameByMode[defaultMode],
                taskNameByMode,
                defaultTaskNameMode: defaultMode,
                previewUrl: single.file.previewUrl,
                durationSeconds: single.file.durationSeconds,
                sourceLabel: '📹 Single file',
                file: single.file,
                videoIndex: videoIndex > 0 ? videoIndex : undefined,
            }
            mainItems.push(item)
        } else {
            // Multi-file group without clean body/hooks (vd: body only, or 3+ extras)
            // Emit each as MainItemFile but with shared taskNameByMode (group basePart)
            for (const p of group) {
                const item: MainItemFile = {
                    kind: 'file',
                    taskName: p.file.name, // fall back to file name (no clear D1 pick)
                    taskNameByMode: {
                        A: p.coreBase,
                        B: p.basePart,
                        C: p.file.name,
                    },
                    defaultTaskNameMode: 'A',
                    previewUrl: p.file.previewUrl,
                    durationSeconds: p.file.durationSeconds,
                    sourceLabel: '📹 Single file',
                    file: p.file,
                    videoIndex: p.videoIndex > 0 ? p.videoIndex : undefined,
                }
                mainItems.push(item)
            }
        }
    }

    // Files that couldn't be parsed into pairing → singleton tasks
    for (const f of unparsedFiles) {
        mainItems.push({
            kind: 'file',
            taskName: f.name,
            taskNameByMode: { A: f.name, B: f.name, C: f.name },
            defaultTaskNameMode: 'A',
            previewUrl: f.previewUrl,
            durationSeconds: f.durationSeconds,
            sourceLabel: '📹 Single file',
            file: f,
        })
    }

    return { mainItems, pairingGroups, unpaired: unparsedFiles, hasPairing }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 5 — Pattern decision matrix (D6 + D2)                             */
/* ════════════════════════════════════════════════════════════════════════ */

interface PatternDecisionInput {
    rootVideoFiles: FileEntry[]
    mainFiles: FileEntry[]
    bundleFolders: SubfolderProfile[]
    outputContainerFolders: SubfolderProfile[]
    arollSharedFolders: SubfolderProfile[]
    arollPerVideoFolders: SubfolderProfile[]
    generalBrollFolders: SubfolderProfile[]
    perVideoBrollFolders: SubfolderProfile[]
    imageFolders: SubfolderProfile[]
    hasPairing: boolean
    /**
     * Total subfolders seen across the recursive tree (depth 0..MAX_DEPTH).
     * Used by the P0_EMPTY guard: if the root has 0 videos and the tree has
     * many subfolders, the user almost certainly pasted a *container* folder
     * (Client manager, year/month index, etc.) instead of a project folder.
     */
    totalSubfolderCount: number
    /**
     * Total video files seen anywhere in the recursive tree. If this is 0 too,
     * we know videos genuinely don't live within depth-4 — the right answer is
     * "drill down into a specific project subfolder", not "1 task per file = 0".
     */
    totalVideoCountRecursive: number
}

interface PatternDecisionResult {
    primaryPattern: PrimaryPattern
    rationale: string
    /** Some patterns pull MainItem from output container instead of root */
    overrideMainSource?: 'output-container'
}

function decidePattern(input: PatternDecisionInput): PatternDecisionResult {
    const {
        rootVideoFiles,
        mainFiles,
        bundleFolders,
        outputContainerFolders,
        arollSharedFolders,
        arollPerVideoFolders,
        hasPairing,
        totalSubfolderCount,
        totalVideoCountRecursive,
    } = input

    const R = rootVideoFiles.length
    const hasRootMainFiles = mainFiles.length > 0

    // P0_EMPTY — "container folder" guard.
    // [Bug 2026-06-09] User pasted Dropbox client-manager root → scanner
    // traversed 1554 subfolders down to depth-4 but found 0 videos. The old
    // code fell through to P1 "0 task, confidence 50%" which read as
    // "Velox is broken". Detect this UP FRONT and surface an actionable hint
    // instead of pretending we have a pattern.
    //
    // Triggers when:
    //   - 0 videos at root      (R === 0)
    //   - 0 videos anywhere in the recursive tree
    //   - many subfolders detected — ≥10 is the floor (a Project folder is
    //     usually <10 subfolders; only Client managers / yearly indices have
    //     dozens-to-thousands).
    if (
        R === 0 &&
        totalVideoCountRecursive === 0 &&
        totalSubfolderCount >= 10
    ) {
        return {
            primaryPattern: 'P0_EMPTY',
            rationale:
                `P0_EMPTY: 0 video file trong toàn bộ folder, nhưng phát hiện ` +
                `${totalSubfolderCount} subfolders. Có khả năng bạn dán link ` +
                `folder cha (vd: Client Manager, Index Tháng) thay vì link ` +
                `Project cụ thể. Hãy mở 1 project bên trong và copy link folder đó.`,
        }
    }

    // P4 — output container + A-Roll shared
    if (outputContainerFolders.length > 0 && arollSharedFolders.length > 0) {
        return {
            primaryPattern: 'P4',
            rationale: `P4: output container ("${outputContainerFolders[0].name}") + A-Roll shared ("${arollSharedFolders[0].name}"). MainItems từ output container.`,
            overrideMainSource: 'output-container',
        }
    }

    // P5 — A-Roll per-video + root main files + pairing
    if (arollPerVideoFolders.length > 0 && hasRootMainFiles && hasPairing) {
        return {
            primaryPattern: 'P5',
            rationale: `P5: ${arollPerVideoFolders.length} A-Roll per-video folder + ${mainFiles.length} root main files với pairing.`,
        }
    }

    // P3 — bundle folders + no root videos
    if (bundleFolders.length > 0 && R === 0) {
        return {
            primaryPattern: 'P3',
            rationale: `P3: ${bundleFolders.length} bundle folders + 0 root video files. Mỗi bundle = 1 task.`,
        }
    }

    // P2 — root main files + pairing
    if (hasRootMainFiles && hasPairing) {
        return {
            primaryPattern: 'P2',
            rationale: `P2: ${mainFiles.length} root main files với pairing detected.`,
        }
    }

    // P2 fallback — clean naming (≥70% match Video N) without explicit pairing
    if (hasRootMainFiles && !hasPairing) {
        const matchCount = mainFiles.filter((f) => RX_VIDEO_N.test(f.name)).length
        if (matchCount / mainFiles.length >= 0.7) {
            return {
                primaryPattern: 'P2',
                rationale: `P2 fallback: ${matchCount}/${mainFiles.length} files match Video N naming (≥70%), no pairing.`,
            }
        }
    }

    // P7 — D6 strict 50% camera-dump
    if (hasRootMainFiles) {
        const ratio = computeCameraDumpRatio(mainFiles.map((f) => f.name))
        if (ratio >= 0.5) {
            return {
                primaryPattern: 'P7',
                rationale: `P7: ${Math.round(ratio * 100)}% root files match camera-dump regex (≥50% threshold). Warning emitted.`,
            }
        }
    }

    // P1 — fallback
    return {
        primaryPattern: 'P1',
        rationale: `P1: ${R} root video files, no clear pattern match. Mỗi file → 1 task.`,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Phase 5b — Per-video matching                                           */
/* ════════════════════════════════════════════════════════════════════════ */

function matchPerVideoFolders(
    mainItems: MainItem[],
    perVideoBrollFolders: SubfolderProfile[],
    arollPerVideoFolders: SubfolderProfile[],
    warnings: string[],
): MainItem[] {
    return mainItems.map((item) => {
        if (!item.videoIndex) return item

        const brollMatches = perVideoBrollFolders.filter(
            (s) => s.perVideoTag?.videoIndex === item.videoIndex,
        )
        const arollMatches = arollPerVideoFolders.filter(
            (s) => s.perVideoTag?.videoIndex === item.videoIndex,
        )

        const next = { ...item } as MainItem

        if (brollMatches.length > 0) {
            next.perVideoBrollUrls = brollMatches.map((s) => s.url)
        }

        if (arollMatches.length === 1) {
            next.perVideoArollUrl = arollMatches[0].url
        } else if (arollMatches.length > 1) {
            // Take first + warning
            next.perVideoArollUrl = arollMatches[0].url
            warnings.push(
                `Video ${item.videoIndex} có ${arollMatches.length} A-Roll per-video folders — chỉ dùng folder đầu tiên ("${arollMatches[0].name}").`,
            )
        }

        return next
    })
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Build MainItem from output container (P4 case)                          */
/* ════════════════════════════════════════════════════════════════════════ */

function buildMainItemsFromContainer(
    container: SubfolderProfile,
): { mainItems: MainItem[]; pairingGroups: ScanDiagnosticsV3['pairingGroups']; hasPairing: boolean } {
    return buildPairedMainItems(container.videoFiles)
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Build MainItem from folder bundles (P3 case)                            */
/* ════════════════════════════════════════════════════════════════════════ */

function buildMainItemsFromBundles(bundles: SubfolderProfile[]): MainItem[] {
    return bundles.map<MainItem>((folder) => {
        const item: MainItemFolderBundle = {
            kind: 'folder-bundle',
            taskName: folder.name,
            taskNameByMode: { A: folder.name, B: folder.name, C: folder.name },
            defaultTaskNameMode: 'A',
            previewUrl: folder.url,
            durationSeconds: 0,
            sourceLabel: `📁 Bundle (${folder.videoFiles.length} files)`,
            folder,
        }
        // Try to extract videoIndex from folder name
        const m = folder.name.match(RX_VIDEO_N)
        if (m) {
            item.videoIndex = parseInt(m[2], 10) || undefined
        }
        return item
    })
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Build BrollV3 + decide brollMatchPolicy (D2)                            */
/* ════════════════════════════════════════════════════════════════════════ */

function buildBrollStructure(args: {
    generalBrollFolders: SubfolderProfile[]
    perVideoBrollFolders: SubfolderProfile[]
    brollLooseFiles: FileEntry[]
}): { broll: BrollV3 | null; policy: BrollMatchPolicy } {
    const { generalBrollFolders, perVideoBrollFolders, brollLooseFiles } = args

    if (
        generalBrollFolders.length === 0 &&
        perVideoBrollFolders.length === 0 &&
        brollLooseFiles.length === 0
    ) {
        return { broll: null, policy: 'NONE' }
    }

    const generalFolders: BrollFolder[] = generalBrollFolders.map((s) => ({
        url: s.url,
        name: s.name,
        fileCount: s.totalVideoCountRecursive,
        variant: s.brollVariant as BrollVariant | undefined,
    }))

    const perVideoFolders: PerVideoBrollFolder[] = perVideoBrollFolders.map((s) => ({
        url: s.url,
        name: s.name,
        fileCount: s.totalVideoCountRecursive,
        variant: s.brollVariant as BrollVariant | undefined,
        videoIndex: s.perVideoTag?.videoIndex ?? 0,
        prefix: s.perVideoTag?.prefix ?? '',
    }))

    const broll: BrollV3 = {
        generalFolders,
        perVideoFolders,
        looseFiles: brollLooseFiles,
        totalCount:
            generalFolders.reduce((s, f) => s + f.fileCount, 0) +
            perVideoFolders.reduce((s, f) => s + f.fileCount, 0) +
            brollLooseFiles.length,
    }

    // D2 policy
    const hasGeneral = generalFolders.length > 0
    const hasPerVideo = perVideoFolders.length > 0

    let policy: BrollMatchPolicy
    if (hasGeneral && hasPerVideo) {
        policy = 'PENDING_USER_CONFIRM'
    } else if (hasGeneral) {
        policy = 'GENERAL_ONLY'
    } else if (hasPerVideo) {
        policy = 'PERVIDEO_ONLY'
    } else {
        // Only loose files
        policy = 'GENERAL_ONLY'
    }

    return { broll, policy }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Build SharedAsset[]                                                     */
/* ════════════════════════════════════════════════════════════════════════ */

function buildSharedAssets(
    sharedAssetFiles: RootFileClassification['sharedAssetFiles'],
): SharedAsset[] {
    return sharedAssetFiles.map<SharedAsset>(({ file, type }) => ({
        type,
        file,
    }))
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Confidence score                                                        */
/* ════════════════════════════════════════════════════════════════════════ */

function computeConfidence(args: {
    primaryPattern: PrimaryPattern
    wrapperConfidence: number
    rootSubfolderProfiles: SubfolderProfile[]
    signalsMatched: number
}): number {
    let confidence = 0.5
    confidence += args.signalsMatched * 0.15
    if (args.wrapperConfidence >= 6) confidence += 0.1

    // ≥80% subfolders classified with score ≥5
    const allFolders = collectAllFolders(args.rootSubfolderProfiles)
    if (allFolders.length > 0) {
        const wellClassified = allFolders.filter((p) => {
            const maxScore = Math.max(...Object.values(p.scores))
            return maxScore >= 5 && p.classifiedAs !== 'ambiguous'
        }).length
        if (wellClassified / allFolders.length >= 0.8) confidence += 0.1
    }

    if (args.primaryPattern === 'P7') confidence -= 0.2
    // P0_EMPTY is a DIAGNOSIS, not a successful classification. Force
    // confidence to 0 so the UI never shows "50%" next to it (which would
    // imply "Velox half-detected something" — wrong; Velox detected nothing
    // because there's nothing TO detect within depth-4).
    if (args.primaryPattern === 'P0_EMPTY') return 0

    // Clamp [0, 1]
    return Math.max(0, Math.min(1, confidence))
}

function collectAllFolders(profiles: SubfolderProfile[]): SubfolderProfile[] {
    const out: SubfolderProfile[] = []
    function walk(p: SubfolderProfile) {
        out.push(p)
        for (const sub of p.subSubfolders) walk(sub)
    }
    for (const p of profiles) walk(p)
    return out
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
 * Run all 5 phases of Velox Deep Scan v3.1 → return ScanResultV3.
 *
 * Pipeline:
 *   Phase 0  — Wrapper detect (D5 layered confidence) → drill if confirmed
 *   Phase 1  — Recursive inventory (already in cloud-scanner output)
 *   Phase 2  — Subfolder classifier (7 dimensions)
 *   Phase 3  — Root file classifier (main / broll / shared)
 *   Phase 4  — Pairing detector with D1 3-mode taskName
 *   Phase 5  — Pattern decision matrix + per-video matching + D2 brollMatchPolicy + D6 P7
 */
export function classifyScan(tree: RawScanTree): ScanResultV3 {
    // ─── Phase 0 + 1 + 2 ─────────────────────────────────────────
    const phase02 = runPhase0to2(tree)
    const warnings = [...phase02.warnings]

    // Collect classified subfolders (flat list of root-level + any depth)
    const allFolders = collectAllFolders(phase02.rootSubfolderProfiles)

    const bundleFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'bundle',
    )
    const outputContainerFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'output-container',
    )
    const arollSharedFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'aroll-shared',
    )
    const arollPerVideoFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'aroll-pervideo',
    )
    const generalBrollFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'broll',
    )
    const perVideoBrollFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'per-video-broll',
    )
    const imageFolders = phase02.rootSubfolderProfiles.filter(
        (s) => s.classifiedAs === 'images',
    )

    // ─── Phase 3 — Root file classifier ──────────────────────────
    const rootVideoFiles = phase02.rootFileEntries.filter((f) => f.isVideo)
    const fileClass = classifyRootFiles(rootVideoFiles)

    // ─── Phase 4 — Pairing of root main files ────────────────────
    const rootPairing = buildPairedMainItems(fileClass.mainFiles)

    // ─── Phase 5 — Pattern decision ──────────────────────────────
    // Compute totals here so P0_EMPTY guard can detect "container folder" case
    // (many subfolders, 0 videos anywhere) UP FRONT — see decidePattern §P0_EMPTY.
    const totalSubfolderCount = countSubfolders(phase02.rootSubfolderProfiles)
    const totalVideoCountRecursive = countRecursiveVideos(
        phase02.effectiveTree.rootFiles,
        phase02.rootSubfolderProfiles,
    )

    const decision = decidePattern({
        rootVideoFiles,
        mainFiles: fileClass.mainFiles,
        bundleFolders,
        outputContainerFolders,
        arollSharedFolders,
        arollPerVideoFolders,
        generalBrollFolders,
        perVideoBrollFolders,
        imageFolders,
        hasPairing: rootPairing.hasPairing,
        totalSubfolderCount,
        totalVideoCountRecursive,
    })

    // [P0_EMPTY] When the classifier diagnoses a container folder, also push
    // a human-readable warning so QuickCreateMode banner picks it up without
    // having to special-case the pattern code.
    if (decision.primaryPattern === 'P0_EMPTY') {
        warnings.push(
            `⚠️ Folder rỗng video (P0_EMPTY) — đã quét ${totalSubfolderCount} ` +
            `subfolders nhưng KHÔNG tìm thấy file video nào trong phạm vi 4 cấp. ` +
            `Bạn có thể đang dán nhầm link folder cha. Vui lòng vào 1 project ` +
            `cụ thể bên trong (vd: Khách A → LGR Tháng 6) rồi copy link folder đó.`,
        )
    }

    // Build mainItems based on detected pattern
    let mainItems: MainItem[]
    let pairingGroupsForDiag = rootPairing.pairingGroups

    if (decision.overrideMainSource === 'output-container' && outputContainerFolders.length > 0) {
        // P4 — pull mainItems from output container instead of root
        const containerPairing = buildMainItemsFromContainer(outputContainerFolders[0])
        mainItems = containerPairing.mainItems
        pairingGroupsForDiag = containerPairing.pairingGroups
    } else if (decision.primaryPattern === 'P3') {
        // P3 — every bundle folder = 1 task
        mainItems = buildMainItemsFromBundles(bundleFolders)
    } else if (decision.primaryPattern === 'P7') {
        // P7 — every root video as singleton + warning
        warnings.push(
            'Folder hỗn loạn (P7): ≥50% files match camera-dump regex. Review trước khi tạo task.',
        )
        mainItems = rootPairing.mainItems
    } else {
        // P1 / P2 / P5 — use root pairing result
        mainItems = rootPairing.mainItems
    }

    // ─── Per-video matching (Phase 5b) ───────────────────────────
    mainItems = matchPerVideoFolders(
        mainItems,
        perVideoBrollFolders,
        arollPerVideoFolders,
        warnings,
    )

    // ─── Build BrollV3 + D2 policy ───────────────────────────────
    const { broll, policy: brollMatchPolicy } = buildBrollStructure({
        generalBrollFolders,
        perVideoBrollFolders,
        brollLooseFiles: fileClass.brollLooseFiles,
    })

    // ─── Shared assets ──────────────────────────────────────────
    const sharedAssets = buildSharedAssets(fileClass.sharedAssetFiles)

    // ─── Confidence score ───────────────────────────────────────
    const signalsMatched = [
        outputContainerFolders.length > 0,
        arollSharedFolders.length > 0,
        arollPerVideoFolders.length > 0,
        bundleFolders.length > 0,
        fileClass.mainFiles.length > 0,
        rootPairing.hasPairing,
    ].filter(Boolean).length

    const confidence = computeConfidence({
        primaryPattern: decision.primaryPattern,
        wrapperConfidence: phase02.wrapperConfidence,
        rootSubfolderProfiles: phase02.rootSubfolderProfiles,
        signalsMatched,
    })

    // ─── Diagnostics ────────────────────────────────────────────
    const prefixDetected = detectBatchPrefix(
        fileClass.mainFiles
            .map(parseFilenameForPairing)
            .filter((p): p is NonNullable<typeof p> => p !== null),
    )

    const diagnostics: ScanDiagnosticsV3 = {
        isWrapper: phase02.isWrapper,
        wrapperName: phase02.wrapperName,
        wrapperConfidenceBreakdown: phase02.wrapperBreakdown,
        effectiveRootUrl: phase02.effectiveTree.rootUrl,
        patternDetectionRationale: decision.rationale,
        totalVideoCountRecursive,
        totalSubfolderCount,
        ignoredDeepFiles: phase02.effectiveTree.ignoredDeepFiles,
        subfolderScores: summarizeSubfolderScores(phase02.rootSubfolderProfiles),
        fileScores: fileClass.fileScores,
        pairingGroups: pairingGroupsForDiag,
        prefixDetected,
    }

    return {
        videos: mainItemsToV1Videos(mainItems),
        primaryPattern: decision.primaryPattern,
        isWrapper: phase02.isWrapper,
        wrapperConfidence: phase02.wrapperConfidence,
        confidence,
        mainItems,
        broll,
        brollMatchPolicy,
        sharedAssets,
        briefingDocs: phase02.briefingDocs,
        scriptDocs: phase02.scriptDocs,
        warnings,
        diagnostics,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Re-exported helpers (used by API route to build FileEntry)              */
/* ════════════════════════════════════════════════════════════════════════ */

export { isVideoFile, isAudioFile, isImageFile, isDocumentFile }
