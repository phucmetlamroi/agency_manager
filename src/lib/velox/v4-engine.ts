/**
 * [Velox v4 — Engine Orchestrator]
 *
 * Walks the input tree → runs folder triage (Pass 1) → classifies the
 * deliverable candidates (Pass 2) → routes the rest into the Raw and
 * Unsorted trays.
 *
 * At this point (P1.7) the engine still returns a PARTIAL `VeloxScanResult`:
 * concepts = [] and sharedAssets = [] because the grouper (P2) hasn't
 * landed yet. Callers can still use `mappedNodes` from the partial result
 * for diagnostics and unit tests.
 *
 * Spec sections covered here: §3.1 pipeline overview · §3.2 triage routing
 * rules · §3.6 confidence → band mapping.
 */

import {
    classifyTree,
    isVideo,
    isRawDumpName,
    hasRoleToken,
    type FolderTriageEntry,
} from './v4-folder-triage'
import {
    classifyFile,
    applySiblingCorroboration,
    type CorroborationBucket,
    type RoleVerdict,
} from './v4-role-classifier'
import { loadRolesConfig, type VeloxRolesConfig } from './v4-roles-loader'
import type {
    ScanInputFile,
    ScanInputFolder,
    ScanInputNode,
    VeloxFile,
    VeloxScanInput,
    VeloxScanResult,
} from './v4-types'

// ────────────────────────────────────────────────────────────────────────────
//  Public entry
// ────────────────────────────────────────────────────────────────────────────

/**
 * Internal-only — what P1.7 produces. P2's grouper will consume this to
 * build `VeloxConcept[]` + `sharedAssets`. The bundle is exported so tests
 * and the diagnostic UI can inspect intermediate state without re-running
 * the engine.
 */
export interface EngineIntermediate {
    /** Files that survived triage + classification with confidence ≥ 0.60. */
    mappedNodes: MappedNode[]
    /** Files that classified UNKNOWN or with confidence < 0.60. */
    unsorted: VeloxFile[]
    /** Raw-dump + source-bucket files. */
    raw: VeloxFile[]
    /** Triage verdicts for every folder — surfaced for the diagnostic panel. */
    folderVerdicts: FolderTriageEntry[]
    /** Human warnings (e.g. "folder X has both organized and raw children"). */
    warnings: string[]
}

/** A file classified with high enough confidence to land on the map. The
 *  grouper attaches it to a concept and adds a node id. */
export interface MappedNode {
    file: VeloxFile
    verdict: RoleVerdict
    /** The folder this file lives in (path-from-root) — used by the
     *  grouper to derive concept keys per spec §3.7a. */
    folderPath: string
    /** Pointer to the folder node itself, so the grouper can read the
     *  parent's name without re-walking. */
    parentFolder?: ScanInputFolder
}

/**
 * Run Pass 1 + Pass 2 of the v4 pipeline. The result is a partial
 * `VeloxScanResult` (concepts + sharedAssets empty) plus the intermediate
 * bundle the grouper will consume in P2.
 */
export function runEngineV4(input: VeloxScanInput): {
    result: VeloxScanResult
    intermediate: EngineIntermediate
} {
    const cfg = loadRolesConfig(input.clientId)
    const warnings: string[] = []

    // ─ Pass 1 ──────────────────────────────────────────────────────────────
    //   Triage every folder in the tree. The verdicts dictate which folders
    //   contribute candidate files (ORGANIZED + role-tokened MIXED), which
    //   become source data for the Raw tray (RAW_DUMP + SOURCE_BUCKET +
    //   non-role MIXED), and which are dropped silently (EMPTY).
    const folderVerdicts = classifyTree(input.tree, input.clientId)
    const folderClassByPath = new Map(folderVerdicts.map(v => [v.pathFromRoot, v.verdict.class]))

    // Pre-compute "parent has both organized + raw" so we can warn — spec
    // notes this is the OBJ case (Video 1 organized vs Nested Sequence raw
    // at the same depth).
    const parentChildClasses = new Map<string, Set<string>>()
    for (const fv of folderVerdicts) {
        const parts = fv.pathFromRoot.split('/')
        if (parts.length < 2) continue
        const parent = parts.slice(0, -1).join('/')
        if (!parentChildClasses.has(parent)) parentChildClasses.set(parent, new Set())
        parentChildClasses.get(parent)!.add(fv.verdict.class)
    }
    for (const [parent, classes] of parentChildClasses) {
        if (classes.has('ORGANIZED') && classes.has('RAW_DUMP')) {
            warnings.push(
                `Parent "${parent}" mixes ORGANIZED and RAW_DUMP children — organized lifted onto map, raw stays in tray.`,
            )
        }
    }

    // ─ Candidate gathering ─────────────────────────────────────────────────
    const candidates: Array<{ file: ScanInputFile; folder: ScanInputFolder | null; folderPath: string }> = []
    const raw: VeloxFile[] = []
    const unsorted: VeloxFile[] = []

    // Walk the tree once, deciding per-file where it goes.
    walkTree(input.tree, null, '', (file, parent, path) => {
        // Skip non-video files unless they qualify by docExt (script/caption)
        // — Pass 2 will surface them as SCRIPT/CAPTION nodes.
        const ext = (file.name.split('.').pop() ?? '').toLowerCase()
        const isDocRole = cfg.roles.some(r => r.docExt?.includes(ext))
        if (!isVideo(file.name, cfg) && !isDocRole) return

        // Folder-class lookup — root files use the synthetic "" key (root
        // is always treated as ORGANIZED so root-level role-tokened files
        // surface; root raw files still go to the tray).
        const folderClass = path ? folderClassByPath.get(path) ?? 'ORGANIZED' : 'ORGANIZED'

        const veloxFile = toVeloxFile(file)

        if (folderClass === 'SOURCE_BUCKET' || folderClass === 'RAW_DUMP') {
            veloxFile.rawReason = folderClass === 'SOURCE_BUCKET'
                ? `lives in source-bucket folder "${parent?.name ?? path}"`
                : `lives in raw-dump folder "${parent?.name ?? path}"`
            raw.push(veloxFile)
            return
        }

        // MIXED: split — role-tokened files become candidates, raw-named
        // files go to Raw, the rest go to Unsorted.
        if (folderClass === 'MIXED') {
            if (isRawDumpName(file.name, cfg)) {
                veloxFile.rawReason = 'raw-dump filename in MIXED folder'
                raw.push(veloxFile)
                return
            }
            if (hasRoleToken(file.name, cfg)) {
                candidates.push({ file, folder: parent, folderPath: path })
                return
            }
            // No role token → drop to Unsorted so the user can drag-place it.
            unsorted.push(veloxFile)
            return
        }

        // ORGANIZED (or implicit root)
        if (isRawDumpName(file.name, cfg)) {
            veloxFile.rawReason = 'raw-dump filename even inside organised folder'
            raw.push(veloxFile)
            return
        }
        candidates.push({ file, folder: parent, folderPath: path })
    })

    // ─ Pass 2 — classify candidates ────────────────────────────────────────
    const verdicts: Array<{
        file: ScanInputFile
        folderPath: string
        parentFolder: ScanInputFolder | null
        verdict: RoleVerdict
    }> = candidates.map(c => ({
        file: c.file,
        folderPath: c.folderPath,
        parentFolder: c.folder,
        verdict: classifyFile(c.file.name, cfg),
    }))

    // Sibling corroboration — bucket by folderPath. The grouper will redo
    // this at concept level in P2, but folder-level boosts are correct in
    // most cases and let UNKNOWN/very-low-confidence files settle into
    // Unsorted now.
    const bucketMap = new Map<string, CorroborationBucket>()
    for (const v of verdicts) {
        if (!bucketMap.has(v.folderPath)) {
            bucketMap.set(v.folderPath, { key: v.folderPath, items: [] })
        }
        bucketMap.get(v.folderPath)!.items.push(v.verdict)
    }
    applySiblingCorroboration([...bucketMap.values()])

    const mappedNodes: MappedNode[] = []
    for (const v of verdicts) {
        if (v.verdict.role === 'UNKNOWN' || v.verdict.confidence < 0.6) {
            unsorted.push(toVeloxFile(v.file))
            continue
        }
        mappedNodes.push({
            file: toVeloxFile(v.file),
            verdict: v.verdict,
            folderPath: v.folderPath,
            parentFolder: v.parentFolder ?? undefined,
        })
    }

    // ─ Stats + result envelope ─────────────────────────────────────────────
    const totalFiles = countFiles(input.tree)
    const result: VeloxScanResult = {
        schemaVersion: 'velox-4.0',
        rootFolder: input.rootFolder,
        scannedAt: '__deterministic_placeholder__', // engine consumers stamp this
        stats: {
            totalFiles,
            mappedFiles: mappedNodes.length,
            rawFiles: raw.length,
            unsortedFiles: unsorted.length,
            // Concepts + hooksDetected filled in by P2's grouper. For now
            // surface 0 — UI consumers should refresh after grouping.
            conceptsDetected: 0,
            hooksDetected: mappedNodes.filter(m => m.verdict.role === 'HOOK').length,
        },
        concepts: [],
        sharedAssets: [],
        trays: { raw, unsorted },
        warnings,
    }

    return {
        result,
        intermediate: {
            mappedNodes,
            unsorted,
            raw,
            folderVerdicts,
            warnings,
        },
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function walkTree(
    nodes: ScanInputNode[],
    parent: ScanInputFolder | null,
    parentPath: string,
    visit: (file: ScanInputFile, parent: ScanInputFolder | null, path: string) => void,
): void {
    for (const n of nodes) {
        if (!n.isFolder) {
            visit(n, parent, parentPath)
            continue
        }
        const childPath = parentPath ? `${parentPath}/${n.name}` : n.name
        walkTree(n.children, n, childPath, visit)
    }
}

function countFiles(nodes: ScanInputNode[]): number {
    let total = 0
    walkTree(nodes, null, '', () => { total++ })
    return total
}

function toVeloxFile(f: ScanInputFile): VeloxFile {
    return {
        name: f.name,
        path: f.path,
        url: f.url ?? `velox-stub://${encodeURIComponent(f.path)}`,
        ext: (f.name.split('.').pop() ?? '').toLowerCase(),
        sizeBytes: f.sizeBytes ?? 0,
    }
}
