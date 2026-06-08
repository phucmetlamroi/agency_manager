/**
 * [Velox v4 — Types]
 *
 * Output schema for the v4 deep-scan engine. Spec §3.8.
 *
 * Design constraint: v4 runs SIDE-BY-SIDE with v3 — these types are NEW, do not
 * touch `velox-helpers.ts` (v3) which is still in production. The API route
 * `/api/integrations/scan-folder` accepts `?v=4` to opt in.
 *
 * Reference: spec FEATURE_REQUIREMENTS_VELOX_MULTIHOOK_MAP_v4.md §3.8.
 */

// ────────────────────────────────────────────────────────────────────────────
//  Top-level scan result
// ────────────────────────────────────────────────────────────────────────────

export interface VeloxScanResult {
    schemaVersion: 'velox-4.0'
    rootFolder: {
        provider: 'dropbox' | 'gdrive'
        name: string
        url: string
    }
    /** ISO8601 timestamp of the scan run */
    scannedAt: string

    stats: {
        totalFiles: number
        mappedFiles: number
        rawFiles: number
        unsortedFiles: number
        conceptsDetected: number
        hooksDetected: number
    }

    /** Groups of Video/Brand/etc. — see §3.7a for concept-key resolution */
    concepts: VeloxConcept[]

    /** Nodes shared across concepts (e.g. "Main CTA" used by 3 videos) */
    sharedAssets: VeloxNode[]

    /** Files that didn't make it onto the map */
    trays: {
        /** 🗂 raw-dump (Nested Sequence …) + source-bucket folders (B-Roll …) */
        raw: VeloxFile[]
        /** ⚪ confidence < 0.60 — needs manual placement */
        unsorted: VeloxFile[]
    }

    /** Human-readable warnings (e.g. "Folder X may be raw-only") */
    warnings: string[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Concept (Video N / Brand / default "Main")
// ────────────────────────────────────────────────────────────────────────────

export interface VeloxConcept {
    /** Stable id for React keys + drag-drop targets */
    id: string

    /** Display label — "Video 1" | "Glenesk" | "Main" */
    label: string

    /** How the concept key was derived — used for diagnostics + UI hint */
    source: 'subfolder' | 'filename' | 'brand_prefix' | 'default'

    /** Hook/Body/Callout/CTA nodes scoped to this concept */
    nodes: VeloxNode[]

    /** "Final/Reference" nodes — fully edited videos that sit on a separate
     *  layer (don't take part in fan-out) */
    finals: VeloxNode[]

    /** Fan-out wiring inside this concept (hook[i] → body → cta) */
    edges: VeloxEdge[]
}

export interface VeloxEdge {
    from: string  // VeloxNode.id
    to: string    // VeloxNode.id
}

// ────────────────────────────────────────────────────────────────────────────
//  Node — what shows up as a card on the map
// ────────────────────────────────────────────────────────────────────────────

export type VeloxRole =
    | 'HOOK'
    | 'BODY'
    | 'CTA'
    | 'CALLOUT'
    | 'SCRIPT'
    | 'CAPTION'
    | 'FINAL'

/**
 * Sub-roles are optional refinements (not required by spec). Used to support
 * later "smart filtering" features without breaking the seven canonical roles.
 */
export type VeloxSubRole =
    | 'testimonial'
    | 'broll'
    | 'vo'
    | 'social_proof'
    | 'problem_solution'
    | 'benefit'
    | 'transition'
    | 'bumper'
    | 'lower_third'

export type VeloxScope = 'CONCEPT' | 'SHARED'

export type VeloxStatus =
    | 'ACTIVE'      // default — counts toward "hooks detected"
    | 'EXCLUDED'    // file tagged "No Use" — display struck-through, not counted
    | 'SUPERSEDED'  // replaced by a "* Replacement" file — display dim
    | 'PENDING'     // file tagged "Future Edits" — display "not ready" badge

/** Confidence bands → UI behaviour. See spec §3.6. */
export type VeloxBand = 'HIGH' | 'REVIEW'

export interface VeloxModifiers {
    /** Duration in seconds, parsed from "20s" / "20 seconds" tokens */
    durationSec?: number
    /** "16:9" / "vertical" / "square" — free-form */
    aspect?: string
    /** Anything inside parentheses in the filename — audience/angle hint */
    audience?: string
    /** "v2" / "final" / "master" */
    version?: string
}

export interface VeloxNode {
    id: string
    role: VeloxRole
    subRole?: VeloxSubRole

    /** For numbered roles — "Hook 1" → 1. Undefined for named-angle hooks
     *  ("open day hook") and shared nodes ("Main CTA") */
    index?: number

    /** Human-readable display label — "Hook 1" | "open day hook" | "Main CTA" */
    label: string

    scope: VeloxScope
    status: VeloxStatus

    /** Raw confidence 0..1 — kept for diagnostics + Auto/Manual sort */
    confidence: number

    /** Display band — derived from confidence (HIGH ≥0.85, REVIEW 0.60-0.85) */
    band: VeloxBand

    /** True when one file holds MULTIPLE hooks (e.g. "Video 2 Hooks.mov") —
     *  UI shows the note + "📑 nhiều hook trong 1 file" badge. */
    isCompilation?: boolean

    /** Free-form note attached to the node (e.g. compilation explanation) */
    note?: string

    /** One or more files backing the node — multi-file nodes come from part
     *  merging ("Hook 1 (part 1)" + "Hook 1 (part 2)" → 1 node, 2 files). */
    files: VeloxFile[]

    modifiers?: VeloxModifiers
}

// ────────────────────────────────────────────────────────────────────────────
//  File — one physical asset
// ────────────────────────────────────────────────────────────────────────────

export interface VeloxFile {
    name: string
    /** Provider path (Dropbox path / Drive id) for re-fetch */
    path: string
    /** Direct open/preview URL — what node-click navigates to */
    url: string
    ext: string
    sizeBytes: number

    /** If this file came from a (part N) token, the part index lives here */
    part?: number

    /** Reason the file was sent to the Raw tray — surfaced in tooltip */
    rawReason?: string

    /** Tokens extracted by the v4 tokenizer — debug aid */
    rawTokens?: string[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Folder triage (Pass 1) — internal type, exported for tests
// ────────────────────────────────────────────────────────────────────────────

export type FolderClass =
    | 'ORGANIZED'       // ≥50% files carry a role token → on the map
    | 'RAW_DUMP'        // ≥60% files match raw-dump regex → Raw tray
    | 'SOURCE_BUCKET'   // folder name itself is a-roll / b-roll / footage / …
    | 'MIXED'           // neither dominates — split per-file
    | 'EMPTY'           // no video files

export interface FolderTriageResult {
    class: FolderClass
    /** Ratio (0..1) of files carrying a role token in this folder */
    organizedScore: number
    /** Free-form reasons used for the diagnostic panel */
    reasons: string[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Raw input expected by the v4 engine (tests build these directly)
// ────────────────────────────────────────────────────────────────────────────

export interface ScanInputFile {
    /** Final segment — "LGR Video 1 Body.mov" */
    name: string
    /** Provider path or fixture-relative path */
    path: string
    /** Optional URL — if missing, engine fabricates a placeholder */
    url?: string
    isFolder: false
    sizeBytes?: number
    /** ISO8601 — used by the cache layer (§5 / P5) */
    modifiedTime?: string
}

export interface ScanInputFolder {
    name: string
    path: string
    isFolder: true
    /** Direct children — recursive children live in their own descriptors */
    children: ScanInputNode[]
}

export type ScanInputNode = ScanInputFile | ScanInputFolder

/**
 * The shape the v4 engine accepts. Built either from a real cloud-scanner pass
 * (Dropbox/Drive listing) OR a fixture JSON in tests/fixtures/velox-v4/.
 */
export interface VeloxScanInput {
    rootFolder: {
        provider: 'dropbox' | 'gdrive'
        name: string
        url: string
    }
    /** Top-level tree — folders + files at the root */
    tree: ScanInputNode[]
    /** Optional client id used to merge per-client overrides (P5) */
    clientId?: number
}
