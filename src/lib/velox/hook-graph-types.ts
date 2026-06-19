/**
 * [Hook Graph — Multi-Hook Map manual whiteboard]
 *
 * The free-form node graph the user builds by hand on the canvas. It is
 * deliberately DISTINCT from `VeloxScanResult` (the Velox auto-scan), which is
 * now used only as an optional SEED for this graph.
 *
 * ── Core semantics (the "variant generator") ────────────────────────────────
 *   • The graph is a DAG (no cycles).
 *   • Every complete path from a ROOT block (no incoming edge) to a LEAF block
 *     (no outgoing edge) is exactly ONE video deliverable / variant.
 *   • Fan-in (3 Hooks → 1 Body) means "these are alternatives, pick one", so it
 *     MULTIPLIES variants:  3 hooks × 1 body × 2 CTAs = 6 paths = 6 videos.
 *   • A lone block with no edges is itself one path (one deliverable).
 *
 * A block carries a primary `url` (the link the user pastes — the navigation
 * target) and an OPTIONAL `timecode` range (kept for a future Premiere trim).
 * They are flat fields, not a discriminated union — both may be set at once.
 *
 * Persisted in `TaskRawFootage.manualGraph` (JSON), validated server-side by
 * Zod in `src/actions/raw-footage-actions.ts`.  Pure data — no React here.
 */

export const HOOK_GRAPH_SCHEMA_VERSION = 'hookgraph-1' as const

export type HookBlockStatus = 'DRAFT' | 'EDITING' | 'REVIEW' | 'APPROVED' | 'REJECTED'

/** Optional trimmed range of a master file — feeds Premiere setIn/setOut later. */
export interface HookTimecode {
    /** In/out point in seconds (out ≥ in ≥ 0). */
    inSec: number
    outSec: number
    fileUrl?: string
    fileName?: string
}

export interface HookBlock {
    id: string
    /** User-editable display name. Default "Block". */
    name: string
    /** Canvas position in React Flow coordinates. */
    position: { x: number; y: number }

    /** The video link the user pastes — the click/navigation target. */
    url?: string
    /** Optional timecode trim (supplementary, kept for later). */
    timecode?: HookTimecode

    // ── Optional production metadata ───────────────────────────────────────
    /** Palette key (see TAG_PALETTE in hook-graph-style.ts). */
    tag?: string
    status?: HookBlockStatus
    note?: string
    assigneeId?: string | null
    /** Clip duration in seconds — summed per path for the runtime readout. */
    durationSec?: number
    thumbnailUrl?: string
}

export interface HookEdge {
    id: string
    /** Source block id (out-port). */
    from: string
    /** Target block id (in-port). */
    to: string
}

export interface HookGraph {
    schemaVersion: typeof HOOK_GRAPH_SCHEMA_VERSION
    blocks: HookBlock[]
    edges: HookEdge[]
    /** Saved pan/zoom so the canvas reopens where the user left it. */
    viewport?: { x: number; y: number; zoom: number }
}

// ────────────────────────────────────────────────────────────────────────────
//  Constructors / helpers
// ────────────────────────────────────────────────────────────────────────────

/** Cross-runtime id (browser + Node 18+ both expose Web Crypto). */
export function genId(prefix = 'blk'): string {
    const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto
    if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID()}`
    // Fallback (very old runtimes) — not security-sensitive, ids are local.
    return `${prefix}_${Math.random().toString(36).slice(2)}${Math.random()
        .toString(36)
        .slice(2)}`
}

export function emptyHookGraph(): HookGraph {
    return { schemaVersion: HOOK_GRAPH_SCHEMA_VERSION, blocks: [], edges: [] }
}

export function createBlock(partial: Partial<HookBlock> = {}): HookBlock {
    return {
        id: partial.id ?? genId('blk'),
        name: partial.name ?? 'Block',
        position: partial.position ?? { x: 0, y: 0 },
        url: partial.url,
        timecode: partial.timecode,
        tag: partial.tag,
        status: partial.status,
        note: partial.note,
        assigneeId: partial.assigneeId,
        durationSec: partial.durationSec,
        thumbnailUrl: partial.thumbnailUrl,
    }
}

/** True when the block points at real footage (used for "dangling" warnings). */
export function blockHasSource(b: HookBlock): boolean {
    return !!(b.url?.trim() || b.timecode?.fileUrl?.trim())
}

/** The open/preview URL a block navigates to on click (SRS §3.4). */
export function blockOpenUrl(b: HookBlock): string | null {
    const u = b.url?.trim()
    if (u) return u
    const f = b.timecode?.fileUrl?.trim()
    return f || null
}

const TC = (n: number) => {
    const s = Math.max(0, Math.floor(n))
    const mm = Math.floor(s / 60)
    const ss = s % 60
    return `${mm}:${String(ss).padStart(2, '0')}`
}

/** Short human label for a block's source — shown on the card. */
export function blockSourceLabel(b: HookBlock): string {
    const u = b.url?.trim()
    if (u) {
        try {
            const url = new URL(u)
            return url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? '/…' : '')
        } catch {
            return u.slice(0, 28) || 'Link'
        }
    }
    if (b.timecode?.fileUrl?.trim()) {
        const tc = b.timecode
        return `${tc.fileName ? tc.fileName + ' · ' : ''}${TC(tc.inSec)}–${TC(tc.outSec)}`
    }
    return 'Chưa gắn link'
}

// ────────────────────────────────────────────────────────────────────────────
//  Back-compat — older graphs stored a `source` discriminated union
//  ({kind:'empty'|'url'|'timecode'}). Normalise to the flat url/timecode shape
//  so existing TaskRawFootage.manualGraph rows keep working (zero data loss).
// ────────────────────────────────────────────────────────────────────────────

type LegacyBlock = Partial<HookBlock> & {
    source?: {
        kind?: string
        url?: string
        fileUrl?: string
        fileName?: string
        inSec?: number
        outSec?: number
    }
}

export function normalizeBlock(raw: LegacyBlock): HookBlock {
    let url = raw.url
    let timecode = raw.timecode
    if (!url && !timecode && raw.source && typeof raw.source === 'object') {
        const s = raw.source
        if (s.kind === 'url' && s.url) {
            url = s.url
        } else if (s.kind === 'timecode') {
            timecode = {
                inSec: s.inSec ?? 0,
                outSec: s.outSec ?? 0,
                fileUrl: s.fileUrl,
                fileName: s.fileName,
            }
        }
    }
    return createBlock({
        id: raw.id,
        name: raw.name,
        position: raw.position,
        url: url || undefined,
        timecode,
        tag: raw.tag,
        status: raw.status,
        note: raw.note,
        assigneeId: raw.assigneeId,
        durationSec: raw.durationSec,
        thumbnailUrl: raw.thumbnailUrl,
    })
}

export function normalizeGraph(g: HookGraph): HookGraph {
    return { ...g, blocks: (g.blocks ?? []).map((b) => normalizeBlock(b as LegacyBlock)) }
}

export { TC as formatTimecode }
