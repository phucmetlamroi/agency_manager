/**
 * [Velox v4 — Folder Triage (Pass 1)]
 *
 * Per spec §3.2: classify each folder ORGANIZED / RAW_DUMP / SOURCE_BUCKET /
 * MIXED / EMPTY. Velox prioritises ORGANIZED folders for the map; RAW_DUMP +
 * SOURCE_BUCKET collapse into the Raw tray; MIXED splits per-file.
 *
 * Pure module — input is a folder descriptor + roles config, output is the
 * triage verdict. No I/O.
 */

import type {
    FolderClass,
    FolderTriageResult,
    ScanInputFile,
    ScanInputFolder,
    ScanInputNode,
} from './v4-types'
import { loadRolesConfig, type VeloxRolesConfig } from './v4-roles-loader'
import { RX, tokenizeFilename } from './v4-tokenizer'

/**
 * Top-level entry. Pass a folder descriptor + (optional) clientId for
 * per-client overrides. Returns the triage verdict.
 *
 * `classifyFolder` does NOT recurse — it judges THIS folder by its DIRECT
 * children only. The caller (`v4-engine`) walks the tree and calls this on
 * each folder.
 */
export function classifyFolder(
    folder: ScanInputFolder,
    clientId?: number,
): FolderTriageResult {
    const cfg = loadRolesConfig(clientId)
    const reasons: string[] = []

    // 1. Direct video children. Subfolders are NOT counted — we only judge
    //    this folder's own files. The recursion happens in the engine.
    const directVideos = folder.children
        .filter(isFile)
        .filter(f => isVideo(f.name, cfg))

    if (directVideos.length === 0) {
        // Empty folders still respect a source-bucket name (so empty "B-Roll"
        // surfaces as SOURCE_BUCKET, not EMPTY, for clearer warnings).
        if (matchesSourceBucket(folder.name, cfg)) {
            reasons.push(`folder name "${folder.name}" matches a source bucket (and is empty)`)
            return { class: 'SOURCE_BUCKET', organizedScore: 0, reasons }
        }
        reasons.push('no video files directly in this folder')
        return { class: 'EMPTY', organizedScore: 0, reasons }
    }

    const rawish = directVideos.filter(f => isRawDumpName(f.name, cfg)).length
    const clear = directVideos.filter(f => hasRoleToken(f.name, cfg)).length
    const organizedScore = clear / directVideos.length
    const rawScore = rawish / directVideos.length

    // 2. Source-bucket short-circuit — content-aware. The spec's §3.2 lists
    //    "footage" / "b-roll" / "headshots" as bucket names, but real
    //    fixtures (April18 #4) put their HOOK/BODY/CTA files inside a
    //    `Footage/` folder. The strict name-only check would dump those
    //    deliverables to the Raw tray. So we require BOTH the bucket name
    //    AND a low organisation score (<0.3) before classing the folder
    //    as SOURCE_BUCKET. The 0.3 threshold is generous — even a single
    //    Hook among 4 raw files keeps the folder out of the bucket lane.
    if (matchesSourceBucket(folder.name, cfg)) {
        if (organizedScore < 0.3) {
            reasons.push(
                `folder name "${folder.name}" matches a source bucket and ` +
                `organizedScore=${organizedScore.toFixed(2)} < 0.3 → SOURCE_BUCKET`,
            )
            return { class: 'SOURCE_BUCKET', organizedScore: 0, reasons }
        }
        reasons.push(
            `folder name "${folder.name}" matches a source bucket BUT ` +
            `organizedScore=${organizedScore.toFixed(2)} ≥ 0.3 → continue normal triage`,
        )
    }

    reasons.push(
        `${clear}/${directVideos.length} videos carry a role token (organizedScore=${organizedScore.toFixed(2)})`,
    )
    reasons.push(
        `${rawish}/${directVideos.length} videos look like raw-dump (rawScore=${rawScore.toFixed(2)})`,
    )

    if (organizedScore >= 0.5) {
        return { class: 'ORGANIZED', organizedScore, reasons }
    }
    if (rawScore >= 0.6) {
        return { class: 'RAW_DUMP', organizedScore, reasons }
    }
    return { class: 'MIXED', organizedScore, reasons }
}

// ────────────────────────────────────────────────────────────────────────────
//  Public matchers — exported so the role-classifier + per-file triage in
//  MIXED folders can reuse them without re-instantiating regex.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Does this folder name match a source-bucket like "a-roll", "footage", etc.?
 * Case-insensitive, diacritics stripped, multi-space normalised.
 */
export function matchesSourceBucket(
    folderName: string,
    cfg: VeloxRolesConfig = loadRolesConfig(),
): boolean {
    const n = normaliseFolderName(folderName)
    return cfg.sourceBuckets.some(b => normaliseFolderName(b) === n)
}

/** Does this filename look like an NLE/camera default name (RAW_DUMP §3.5)? */
export function isRawDumpName(
    filename: string,
    cfg: VeloxRolesConfig = loadRolesConfig(),
): boolean {
    const base = stripExt(filename)
    if (RX.RAW_DUMP.test(base)) return true
    // Roles config can register extra raw patterns per-client (P5).
    for (const pat of cfg.rawDumpPatterns) {
        try {
            const re = new RegExp(pat, 'i')
            if (re.test(base)) return true
        } catch {
            // Bad pattern in override — skip silently.
        }
    }
    return false
}

/** Does this filename carry any role-defining token (hook / body / cta / …)? */
export function hasRoleToken(
    filename: string,
    cfg: VeloxRolesConfig = loadRolesConfig(),
): boolean {
    const tok = tokenizeFilename(filename)

    // Quick regex pass — the most common roles.
    if (RX.HOOK_WORD.test(tok.normalized)) return true
    if (RX.HOOK_LETTER.test(tok.normalized)) return true
    if (RX.BODY.test(tok.normalized)) return true
    if (RX.CTA.test(tok.normalized)) return true
    if (RX.CALLOUT.test(tok.normalized)) return true
    if (RX.SCRIPT.test(tok.normalized)) return true
    if (RX.CAPTION.test(tok.normalized)) return true

    // Doc-extension shortcut — "script.pdf" with no "script" word still SCRIPT.
    if (tok.ext) {
        for (const r of cfg.roles) {
            if (!r.docExt) continue
            if (r.docExt.includes(tok.ext)) return true
        }
    }

    // Config-driven aliases — catch anything the regex table misses.
    const lower = tok.normalized
    for (const r of cfg.roles) {
        for (const alias of r.aliases) {
            if (!alias) continue
            const a = alias.toLowerCase()
            if (lower.includes(a)) return true
        }
    }
    return false
}

/** Is this filename a video by extension? */
export function isVideo(
    filename: string,
    cfg: VeloxRolesConfig = loadRolesConfig(),
): boolean {
    const ext = extractExt(filename).toLowerCase()
    return cfg.videoExt.includes(ext)
}

// ────────────────────────────────────────────────────────────────────────────
//  Internal helpers
// ────────────────────────────────────────────────────────────────────────────

function isFile(n: ScanInputNode): n is ScanInputFile {
    return !n.isFolder
}

function stripExt(name: string): string {
    const i = name.lastIndexOf('.')
    return i < 0 ? name : name.slice(0, i)
}

function extractExt(name: string): string {
    const i = name.lastIndexOf('.')
    if (i < 0 || i === name.length - 1) return ''
    return name.slice(i + 1)
}

function normaliseFolderName(s: string): string {
    return s
        .normalize('NFC')
        .toLowerCase()
        .replace(/[_|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

// ────────────────────────────────────────────────────────────────────────────
//  Convenience: walk an entire tree and return the triage verdict for every
//  folder. Engine uses this in Pass 1.
// ────────────────────────────────────────────────────────────────────────────

export interface FolderTriageEntry {
    folder: ScanInputFolder
    verdict: FolderTriageResult
    /** Dotted path to the folder from the root — used for display + reasons. */
    pathFromRoot: string
}

export function classifyTree(
    rootChildren: ScanInputNode[],
    clientId?: number,
): FolderTriageEntry[] {
    const out: FolderTriageEntry[] = []
    walk(rootChildren, '', clientId, out)
    return out
}

function walk(
    nodes: ScanInputNode[],
    parentPath: string,
    clientId: number | undefined,
    out: FolderTriageEntry[],
) {
    for (const n of nodes) {
        if (!n.isFolder) continue
        const path = parentPath ? `${parentPath}/${n.name}` : n.name
        const verdict = classifyFolder(n, clientId)
        out.push({ folder: n, verdict, pathFromRoot: path })
        walk(n.children, path, clientId, out)
    }
}

/** Convenience: pick the worst-case class for a list of verdicts. Used by the
 *  engine's mixed-parent rule ("if parent has both ORGANIZED and RAW_DUMP
 *  children → surface organized, hide raw"). */
export function dominantClass(verdicts: FolderClass[]): FolderClass {
    const priority: Record<FolderClass, number> = {
        ORGANIZED: 4,
        MIXED: 3,
        RAW_DUMP: 2,
        SOURCE_BUCKET: 1,
        EMPTY: 0,
    }
    let best: FolderClass = 'EMPTY'
    for (const v of verdicts) {
        if (priority[v] > priority[best]) best = v
    }
    return best
}
