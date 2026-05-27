/**
 * [Velox Deep Scan v3.1 — helper utilities]
 *
 * Pure functions only: regex constants, scoring tables, MIME helpers, prefix
 * detector, taskName resolver, pairing parser. No DB, no IO — testable in
 * isolation.
 *
 * Spec reference: `VELOX-DEEP-SCAN.md` v3.1 sections 4, 5.
 */

import type {
    FileEntry,
    SubfolderRole,
    BrollVariant,
    SharedAssetType,
    BriefingDocType,
    ScriptDocType,
    TaskNameMode,
} from './velox-helpers'

/* ════════════════════════════════════════════════════════════════════════ */
/*  Regex constants                                                         */
/* ════════════════════════════════════════════════════════════════════════ */

/* ── Subfolder name patterns (Phase 2) ──────────────────────────────────── */

/** Strict broll folder name — high confidence */
export const RX_BROLL_STRICT =
    /^(b[\s\-_]?roll|broll|extras?|footage|raw[\s_]?footage|bgr|stock|cutaways?)(\s.*)?$/i

/** Per-video broll — captures (prefix, videoIndex) */
export const RX_PERVIDEO_BROLL =
    /^(video|ad|ep|spot|cut|reel)\s*(\d+)\s*[\-:_]\s*(b[\s\-_]?roll|broll|extras)/i

/** Loose per-video broll match (less strict) */
export const RX_PERVIDEO_BROLL_LOOSE =
    /(video|ad|ep|spot|cut|reel)\s*\d+.*(b[\s\-_]?roll|broll|extras)/i

/** Bundle folder name (e.g., "AD 1", "Video 2", "01") */
export const RX_BUNDLE_STRICT =
    /^(ad|video|ep|episode|spot|cut|reel)[\s_-]?\d+$/i

/** A-roll shared folder */
export const RX_AROLL_SHARED = /^a[\s\-_]?roll$/i

/** A-roll per-video — captures (prefix, videoIndex) */
export const RX_AROLL_PERVIDEO =
    /^(video|ad|ep)\s*(\d+)\s*a[\s\-_]?roll$/i

/** Output container ("Videos & Hooks", "Videos", "Final", "Output", etc.) */
export const RX_OUTPUT_CONTAINER =
    /^(videos?\s*(&|and)\s*hooks?|videos?|final|output|edited|deliverables?|exports?)$/i

/** Images folder */
export const RX_IMAGES_FOLDER = /^(images?|photos?|stills?|pics?|graphics?)$/i

/** Broll variant suffix detector */
export const RX_BROLL_VARIANT_SLOMO = /slo[\s\-]?mo|slow[\s\-]?motion/i
export const RX_BROLL_VARIANT_DRONE = /drone|aerial/i
export const RX_BROLL_VARIANT_WIDE = /\bwide\b/i
export const RX_BROLL_VARIANT_GENERAL = /\b(general|generic|shared|main)\b/i

/* ── File name patterns (Phase 3 + Phase 4) ─────────────────────────────── */

/** Match "Video N" / "AD 1" / "Spot 3" — core base extraction */
export const RX_VIDEO_N =
    /(video|ad|ep|spot|cut|reel)\s*(\d+)/i

/** Full base parse — captures (prefix, coreBase). Use with `.match()` */
export const RX_BASE_PARSE =
    /^(.*?)((?:video|ad|ep|spot|cut|reel)\s*\d+)/i

/** Drone camera-dump signature */
export const RX_DRONE_DJI = /^DJI[_\s-]?\d+/i

/** Generic camera-dump signatures (DSC, IMG, MVI, GOPR, ...) */
export const RX_CAMERA_DUMP =
    /^(DSC|IMG|MVI|GOPR|C\d{4}|MOV|VID|MAH|PXL|CLIP)[_\s-]?\d+/i

/** Shared asset names (Main CTA, Outro, Intro, ...) */
export const RX_SHARED_ASSET =
    /^(main\s+)?(cta|outro|intro|logo|bumper|sting|transition)/i

/** Briefing keyword (for non-video files at root) */
export const RX_BRIEFING_KEYWORD =
    /brief|spec|brand|guideline|requirements|deck|kit|sow|scope|outline/i

/**
 * Script / transcript keyword (for non-video text files).
 *
 * User confirm: ".txt files với tên là script, transcript, ... là file
 * script của khách → link đi vào Scription (form.script)". Apply liberally
 * across document types (.txt/.doc/.docx/.pdf/.rtf) khi tên match.
 */
export const RX_SCRIPT_KEYWORD =
    /\b(scripts?|transcripts?|captions?|subs?|subtitles?|dialog(ue)?s?)\b/i

/** Wrapper folder name keywords (D5 signal 3) */
export const RX_WRAPPER_FOLDER_HINT =
    /^\d+\.\s|.*reno\s*ads|.*(may|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+202\d/i

/* ════════════════════════════════════════════════════════════════════════ */
/*  MIME helpers                                                            */
/* ════════════════════════════════════════════════════════════════════════ */

const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.mov', '.avi', '.mkv', '.webm', '.wmv',
    '.m4v', '.mxf', '.prores', '.ts', '.flv', '.3gp',
])

const AUDIO_EXTENSIONS = new Set([
    '.mp3', '.wav', '.aac', '.flac', '.m4a', '.ogg', '.aif', '.aiff',
])

const IMAGE_EXTENSIONS = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tiff', '.tif',
])

const DOCUMENT_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.txt', '.rtf', '.odt',
    '.ppt', '.pptx', '.key', '.numbers', '.xls', '.xlsx', '.csv',
])

function getExtension(filename: string): string {
    const idx = filename.lastIndexOf('.')
    return idx >= 0 ? filename.slice(idx).toLowerCase() : ''
}

export function isVideoFile(filename: string, mimeType?: string): boolean {
    if (mimeType?.startsWith('video/')) return true
    return VIDEO_EXTENSIONS.has(getExtension(filename))
}

export function isAudioFile(filename: string, mimeType?: string): boolean {
    if (mimeType?.startsWith('audio/')) return true
    return AUDIO_EXTENSIONS.has(getExtension(filename))
}

export function isImageFile(filename: string, mimeType?: string): boolean {
    if (mimeType?.startsWith('image/')) return true
    return IMAGE_EXTENSIONS.has(getExtension(filename))
}

export function isDocumentFile(filename: string, mimeType?: string): boolean {
    if (
        mimeType === 'application/pdf' ||
        mimeType === 'application/msword' ||
        mimeType?.startsWith('application/vnd.openxmlformats') ||
        mimeType?.startsWith('text/')
    ) {
        return true
    }
    return DOCUMENT_EXTENSIONS.has(getExtension(filename))
}

/** Categorize a document file into BriefingDocType */
export function getBriefingDocType(filename: string): BriefingDocType {
    const ext = getExtension(filename)
    switch (ext) {
        case '.pdf': return 'pdf'
        case '.docx': return 'docx'
        case '.doc': return 'doc'
        case '.pptx': return 'pptx'
        case '.rtf': return 'rtf'
        case '.txt': return 'txt'
        default: return 'other'
    }
}

/** Categorize a doc or subtitle file into ScriptDocType. */
export function getScriptDocType(filename: string): ScriptDocType {
    const ext = getExtension(filename)
    switch (ext) {
        case '.txt': return 'txt'
        case '.docx': return 'docx'
        case '.doc': return 'doc'
        case '.pdf': return 'pdf'
        case '.rtf': return 'rtf'
        case '.srt': return 'srt'
        case '.vtt': return 'vtt'
        default: return 'other'
    }
}

/** Subtitle file extensions (.srt SubRip, .vtt WebVTT). Treated as script
 *  fallback when no doc với script keyword detected. */
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.vtt'])

export function isSubtitleFile(filename: string): boolean {
    return SUBTITLE_EXTENSIONS.has(getExtension(filename))
}

/**
 * Is this filename a script doc by KEYWORD match? Document file (PDF/DOC/DOCX/
 * TXT/RTF) AND filename contains script/transcript/caption keyword. Subtitle
 * files (.srt/.vtt) handled SEPARATELY as fallback.
 */
export function isScriptDoc(filename: string): boolean {
    return isDocumentFile(filename) && RX_SCRIPT_KEYWORD.test(filename)
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Brollvariant detector                                                   */
/* ════════════════════════════════════════════════════════════════════════ */

export function detectBrollVariant(name: string): BrollVariant {
    if (RX_BROLL_VARIANT_SLOMO.test(name)) return 'slomo'
    if (RX_BROLL_VARIANT_DRONE.test(name)) return 'drone'
    if (RX_BROLL_VARIANT_WIDE.test(name)) return 'wide'
    if (RX_BROLL_VARIANT_GENERAL.test(name)) return 'general'
    return 'other'
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Shared asset type detector                                              */
/* ════════════════════════════════════════════════════════════════════════ */

export function detectSharedAssetType(filename: string): SharedAssetType {
    const m = filename.match(RX_SHARED_ASSET)
    if (!m) return 'unknown'
    const keyword = m[2].toLowerCase()
    if (keyword === 'cta') return 'cta'
    if (keyword === 'outro') return 'outro'
    if (keyword === 'intro') return 'intro'
    if (keyword === 'logo') return 'logo'
    if (keyword === 'bumper') return 'bumper'
    if (keyword === 'sting' || keyword === 'transition') return 'transition'
    return 'unknown'
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Subfolder scoring (Phase 2) — 7 dimensions                              */
/* ════════════════════════════════════════════════════════════════════════ */

export interface SubfolderScoreInput {
    name: string
    videoCount: number
    imageCount: number
    audioCount: number
    /** Filenames inside the folder (used for sequence/timestamp pattern detection) */
    videoFilenames: string[]
}

export function scoreSubfolder(input: SubfolderScoreInput) {
    const { name, videoCount, imageCount, audioCount, videoFilenames } = input
    const scores = {
        broll: 0,
        perVideoBroll: 0,
        bundle: 0,
        arollShared: 0,
        arollPerVideo: 0,
        outputContainer: 0,
        images: 0,
    }

    const totalFiles = videoCount + imageCount + audioCount

    // BROLL ───────────────────────────────────────────────────────────
    if (RX_BROLL_STRICT.test(name)) scores.broll += 5
    if (/slo[\s\-]?mo|drone|aerial|\bwide\b/i.test(name)) scores.broll += 4
    if (/\b(general|generic|shared)\b/i.test(name)) scores.broll += 3
    if (videoCount >= 10) scores.broll += 2
    if (videoCount > 0) {
        const cameraDumpRatio =
            videoFilenames.filter((f) => RX_CAMERA_DUMP.test(f) || RX_DRONE_DJI.test(f)).length /
            videoCount
        if (cameraDumpRatio >= 0.7) scores.broll += 1
    }

    // PER_VIDEO_BROLL ─────────────────────────────────────────────────
    if (RX_PERVIDEO_BROLL.test(name)) scores.perVideoBroll += 6
    else if (RX_PERVIDEO_BROLL_LOOSE.test(name)) scores.perVideoBroll += 3

    // BUNDLE ──────────────────────────────────────────────────────────
    if (RX_BUNDLE_STRICT.test(name)) scores.bundle += 5
    if (/^\d{1,2}$/.test(name)) scores.bundle += 3
    if (audioCount > 0) scores.bundle += 2
    if (videoCount >= 3 && videoCount <= 20) scores.bundle += 2
    if (videoFilenames.some((f) => /\d{6,}/.test(f))) scores.bundle += 1
    // Penalty: if name also matches broll pattern → not a bundle
    if (RX_BROLL_STRICT.test(name)) scores.bundle -= 3

    // AROLL_SHARED ────────────────────────────────────────────────────
    if (RX_AROLL_SHARED.test(name)) scores.arollShared += 5
    if (/^(main|primary|master)$/i.test(name)) scores.arollShared += 3
    if (videoCount >= 10) scores.arollShared += 1

    // AROLL_PERVIDEO ──────────────────────────────────────────────────
    if (RX_AROLL_PERVIDEO.test(name)) scores.arollPerVideo += 6

    // OUTPUT_CONTAINER ────────────────────────────────────────────────
    if (RX_OUTPUT_CONTAINER.test(name)) scores.outputContainer += 5
    // bonus if ≥2 files have pairing-friendly Video N pattern
    const pairingCandidates = videoFilenames.filter((f) => RX_VIDEO_N.test(f))
    if (pairingCandidates.length >= 2) scores.outputContainer += 3

    // IMAGES ──────────────────────────────────────────────────────────
    if (totalFiles > 0 && imageCount / totalFiles >= 0.8) scores.images += 5
    if (RX_IMAGES_FOLDER.test(name)) scores.images += 3

    return scores
}

/**
 * Tie-break precedence (Phase 2 spec):
 *   perVideoBroll > perVideoAroll > bundle > broll > arollShared > outputContainer > images
 */
const TIE_BREAK_ORDER: SubfolderRole[] = [
    'per-video-broll',
    'aroll-pervideo',
    'bundle',
    'broll',
    'aroll-shared',
    'output-container',
    'images',
]

const SCORE_KEY_TO_ROLE: Record<keyof ReturnType<typeof scoreSubfolder>, SubfolderRole> = {
    perVideoBroll: 'per-video-broll',
    arollPerVideo: 'aroll-pervideo',
    bundle: 'bundle',
    broll: 'broll',
    arollShared: 'aroll-shared',
    outputContainer: 'output-container',
    images: 'images',
}

const ROLE_TO_SCORE_KEY: Record<SubfolderRole, keyof ReturnType<typeof scoreSubfolder> | null> = {
    'per-video-broll': 'perVideoBroll',
    'aroll-pervideo': 'arollPerVideo',
    bundle: 'bundle',
    broll: 'broll',
    'aroll-shared': 'arollShared',
    'output-container': 'outputContainer',
    images: 'images',
    ambiguous: null,
}

/**
 * Classify a subfolder based on its score breakdown.
 * Returns 'ambiguous' if max score < 3.
 */
export function classifySubfolderFromScores(
    scores: ReturnType<typeof scoreSubfolder>,
): SubfolderRole {
    let maxScore = -Infinity
    for (const key of Object.keys(scores) as Array<keyof typeof scores>) {
        if (scores[key] > maxScore) maxScore = scores[key]
    }
    if (maxScore < 3) return 'ambiguous'

    // Walk tie-break order, return first role hitting maxScore
    for (const role of TIE_BREAK_ORDER) {
        const scoreKey = ROLE_TO_SCORE_KEY[role]
        if (scoreKey && scores[scoreKey] === maxScore) return role
    }
    return 'ambiguous'
}

/**
 * Extract perVideoTag (videoIndex + prefix) from a folder name when
 * classified as per-video-broll or aroll-pervideo.
 */
export function extractPerVideoTag(name: string): { videoIndex: number; prefix: string } | null {
    let m = name.match(RX_PERVIDEO_BROLL)
    if (!m) m = name.match(RX_AROLL_PERVIDEO)
    if (!m) return null
    return {
        prefix: m[1].trim().toLowerCase(),
        videoIndex: parseInt(m[2], 10) || 0,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Root file scoring (Phase 3) — 3 dimensions                              */
/* ════════════════════════════════════════════════════════════════════════ */

export interface RootFileScoreInput {
    name: string
    fullName: string
    durationSeconds: number
}

export function scoreRootFile(input: RootFileScoreInput) {
    const { name, durationSeconds } = input
    const scores = { main: 0, broll: 0, sharedAsset: 0 }

    // MAIN scoring ────────────────────────────────────────────────────
    if (RX_VIDEO_N.test(name)) scores.main += 5
    if (/\bbody\b/i.test(name)) scores.main += 4
    else if (!/\b(hooks?|outro|intro|extra)\b/i.test(name)) scores.main += 4 // "no suffix" hint
    if (/\bhooks?\b/i.test(name)) scores.main += 3
    if (durationSeconds >= 30) scores.main += 2
    if (!RX_CAMERA_DUMP.test(name) && !RX_DRONE_DJI.test(name)) scores.main += 2
    if (name.length <= 30) scores.main += 1

    // BROLL scoring ────────────────────────────────────────────────────
    if (/\b(b[\s\-_]?roll|broll|extras?|cutaways?)\b/i.test(name)) scores.broll += 5
    if (RX_DRONE_DJI.test(name)) scores.broll += 5
    if (RX_CAMERA_DUMP.test(name)) scores.broll += 3
    if (durationSeconds > 0 && durationSeconds < 15) scores.broll += 2
    if ((RX_CAMERA_DUMP.test(name) || RX_DRONE_DJI.test(name)) && /\d{6,}/.test(name)) {
        scores.broll += 1 // timestamp + camera prefix combo
    }

    // SHARED_ASSET scoring ────────────────────────────────────────────
    if (RX_SHARED_ASSET.test(name)) scores.sharedAsset += 5
    // singleton heuristic — short name, no Video N, no broll keyword
    if (
        !RX_VIDEO_N.test(name) &&
        !RX_CAMERA_DUMP.test(name) &&
        !RX_DRONE_DJI.test(name) &&
        name.length <= 20
    ) {
        scores.sharedAsset += 3
    }

    return scores
}

export type RootFileClass = 'main' | 'broll' | 'shared_asset' | 'ambiguous'

/**
 * Classify a root file. Default to 'main' when maxScore < 2 (better to over-include
 * than skip a real task).
 */
export function classifyRootFile(scores: ReturnType<typeof scoreRootFile>): {
    classifiedAs: RootFileClass
    lowConfidence: boolean
} {
    const sorted = (Object.entries(scores) as [keyof typeof scores, number][])
        .sort(([, a], [, b]) => b - a)
    const [topKey, topScore] = sorted[0]
    const secondScore = sorted[1]?.[1] ?? 0

    if (topScore < 2) {
        return { classifiedAs: 'main', lowConfidence: true } // default to main
    }

    const lowConfidence = topScore - secondScore < 2

    const map: Record<typeof topKey, RootFileClass> = {
        main: 'main',
        broll: 'broll',
        sharedAsset: 'shared_asset',
    }
    return { classifiedAs: map[topKey], lowConfidence }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Pairing parser (Phase 4) — D1 taskName resolver                         */
/* ════════════════════════════════════════════════════════════════════════ */

export type Suffix = 'body' | 'hooks' | 'main' | 'extra' | ''

export interface ParsedFilename {
    /** Original FileEntry */
    file: FileEntry
    /** Text before the Video N core (e.g., "LGR " in "LGR Video 1 Body.mov"). May be empty. */
    fullPrefix: string
    /** Core base (e.g., "Video 1") — captured group 2 of RX_BASE_PARSE */
    coreBase: string
    /** fullPrefix + coreBase normalized — e.g., "LGR Video 1" */
    basePart: string
    /** Suffix classification */
    suffix: Suffix
    /** Numeric video index (Video N → N) */
    videoIndex: number
}

function detectSuffix(textAfterBase: string): Suffix {
    const t = textAfterBase.trim().toLowerCase()
    if (/\bbody\b/.test(t)) return 'body'
    if (/\bhooks?\b/.test(t)) return 'hooks'
    if (/\bmain\b/.test(t)) return 'main'
    if (t === '' || t === '.') return ''
    return 'extra'
}

/**
 * Parse a filename into prefix + coreBase + suffix. Returns null if no
 * "Video N" / "AD N" / etc. pattern found.
 */
export function parseFilenameForPairing(file: FileEntry): ParsedFilename | null {
    const baseName = file.name // already no extension
    const m = baseName.match(RX_BASE_PARSE)
    if (!m) return null

    const fullPrefix = m[1]
    const coreBase = m[2].trim()
    const afterBase = baseName.slice(m[0].length)
    const suffix = detectSuffix(afterBase)
    const indexMatch = coreBase.match(/(\d+)/)
    const videoIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0

    // Normalize basePart — single space between prefix and coreBase
    const basePart = `${fullPrefix.trim()} ${coreBase}`.trim()

    return {
        file,
        fullPrefix,
        coreBase,
        basePart,
        suffix,
        videoIndex,
    }
}

/**
 * Group parsed filenames by `basePart`. Returns Map<basePart, ParsedFilename[]>.
 */
export function groupByBasePart(
    parsed: ParsedFilename[],
): Map<string, ParsedFilename[]> {
    const groups = new Map<string, ParsedFilename[]>()
    for (const p of parsed) {
        const key = p.basePart.toLowerCase()
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(p)
    }
    return groups
}

/**
 * D1 — Resolve taskName for all 3 modes from a group of parsed files.
 *
 *   A — coreBase ("Video 1")
 *   B — basePart with prefix ("LGR Video 1") [default if any file has prefix]
 *   C — body filename without ext ("LGR Video 1 Body") — falls back to hooks
 *       if no body
 */
export function resolveTaskNameByMode(group: ParsedFilename[]): {
    taskNameByMode: Record<TaskNameMode, string>
    defaultMode: TaskNameMode
} {
    const body = group.find((p) => p.suffix === 'body' || p.suffix === 'main' || p.suffix === '')
    const hooks = group.find((p) => p.suffix === 'hooks')
    const canonical = body ?? hooks ?? group[0]
    if (!canonical) {
        return {
            taskNameByMode: { A: '', B: '', C: '' },
            defaultMode: 'A',
        }
    }

    const modeA = canonical.coreBase
    const modeB = canonical.basePart
    const modeC = canonical.file.name // filename without ext, full

    const hasPrefix = canonical.fullPrefix.trim().length > 0
    const defaultMode: TaskNameMode = hasPrefix ? 'B' : 'A'

    return {
        taskNameByMode: { A: modeA, B: modeB, C: modeC },
        defaultMode,
    }
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Batch-wide prefix detector (for diagnostics)                            */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * Look at all main files + main folders and find the most common non-empty
 * prefix. Used for diagnostics ("prefixDetected") + UI hint.
 */
export function detectBatchPrefix(parsed: ParsedFilename[]): string | undefined {
    const counts = new Map<string, number>()
    for (const p of parsed) {
        const prefix = p.fullPrefix.trim().toLowerCase()
        if (!prefix) continue
        counts.set(prefix, (counts.get(prefix) ?? 0) + 1)
    }
    if (counts.size === 0) return undefined
    let best: [string, number] | null = null
    for (const entry of counts) {
        if (!best || entry[1] > best[1]) best = entry
    }
    return best?.[0]
}

/* ════════════════════════════════════════════════════════════════════════ */
/*  Camera-dump ratio (D6 P7 threshold)                                     */
/* ════════════════════════════════════════════════════════════════════════ */

/**
 * D6 — Compute the ratio of camera-dump-named files (DSC_*, IMG_*, MVI_*, DJI_*, ...)
 * in the root video list. Used to gate P7 (chaos pattern) detection.
 *
 * Threshold: >= 0.5 → primaryPattern = P7
 */
export function computeCameraDumpRatio(filenames: string[]): number {
    if (filenames.length === 0) return 0
    const matches = filenames.filter(
        (f) => RX_CAMERA_DUMP.test(f) || RX_DRONE_DJI.test(f),
    ).length
    return matches / filenames.length
}
