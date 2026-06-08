/**
 * [Velox v4 — Grouper (Pass 3)]
 *
 * Consumes the engine's intermediate output and produces the final
 * `VeloxConcept[]` + `sharedAssets[]` for `VeloxScanResult`.
 *
 * Sub-phases (spec §3.7):
 *   a. Concept key derivation  — this file (P2.1)
 *   b. Part merge              — P2.2
 *   c. Status chain (SUPERSEDED on Replacement) — P2.3
 *   d. Fan-out edges + shared CTA detection      — P2.4
 *   e. Compilation node note                     — P2.4
 *
 * Each phase is exported as a pure function so the engine can run them
 * in order and tests can exercise them in isolation.
 */

import type { MappedNode } from './v4-engine'
import type { VeloxFile, VeloxRole, VeloxStatus, VeloxModifiers } from './v4-types'
import { tokenizeFilename, getPart } from './v4-tokenizer'

// ────────────────────────────────────────────────────────────────────────────
//  §3.7a — Concept key derivation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Stable key + human label for the concept a node belongs to. Engine
 * groups nodes by `key`, UI shows `label`.
 *
 * `source` is surfaced for the diagnostic panel so reviewers can see
 * why two files ended up in the same concept (e.g. "they both live in
 * 'Video 1'" vs "they share the brand prefix 'Glenesk'").
 */
export interface ConceptKeyResolution {
    key: string
    label: string
    source: 'subfolder' | 'filename' | 'brand_prefix' | 'default'
}

/**
 * §3.7a rules in order:
 *   1. Parent subfolder named `Video N` / `Ad N`            → key = folder name.
 *   2. Filename contains `video N` / `ad N`                 → key = "Video N".
 *   3. Filename starts with a brand prefix that REPEATS ≥2  → key = brand.
 *   4. Otherwise                                            → key = "Main".
 *
 * The brand-prefix rule needs the full file population so a single
 * occurrence doesn't get treated as a brand. Pass all mapped nodes
 * into `buildBrandPrefixIndex` once, then call `resolveConceptKey`
 * for each node.
 */
export function resolveConceptKey(
    node: MappedNode,
    brandPrefixes: Set<string>,
): ConceptKeyResolution {
    // ── Rule 1 — parent subfolder Video N / Ad N ──────────────────────────
    if (node.parentFolder) {
        const folderName = node.parentFolder.name
        const folderMatch = folderName.match(/\b(video|ad)\s*0*(\d+)/i)
        if (folderMatch) {
            const kind = folderMatch[1].toLowerCase() === 'ad' ? 'Ad' : 'Video'
            const n = parseInt(folderMatch[2], 10)
            const key = `${kind.toLowerCase()}-${n}`
            return { key, label: `${kind} ${n}`, source: 'subfolder' }
        }
    }

    // ── Rule 2 — filename carries "Video N" / "Ad N" ──────────────────────
    const nameMatch = node.verdict.tokenized.normalized.match(/\b(video|ad)\s*0*(\d+)/i)
    if (nameMatch) {
        const kind = nameMatch[1].toLowerCase() === 'ad' ? 'Ad' : 'Video'
        const n = parseInt(nameMatch[2], 10)
        return {
            key: `${kind.toLowerCase()}-${n}`,
            label: `${kind} ${n}`,
            source: 'filename',
        }
    }

    // ── Rule 3 — brand prefix (must be a repeating prefix across files) ───
    const firstToken = node.verdict.tokenized.tokens[0]
    if (firstToken && brandPrefixes.has(firstToken)) {
        return {
            key: `brand-${firstToken}`,
            label: capitalise(firstToken),
            source: 'brand_prefix',
        }
    }

    // ── Rule 4 — default ──────────────────────────────────────────────────
    return { key: 'main', label: 'Main', source: 'default' }
}

/**
 * Find tokens that appear as the FIRST token of two or more files. Those
 * become brand-prefix candidates (Glenesk/Lochlands case from spec §1
 * folder #3).
 *
 * Excluded by design:
 *   - Tokens that match the rule-2 video/ad pattern (those are concept
 *     numbers, not brands).
 *   - Tokens carrying a role keyword (hook/body/cta/callout) so role-
 *     word files don't accidentally seed a "brand" called "hook".
 *   - Single-character tokens (would over-trigger for "H1"-style names).
 */
export function buildBrandPrefixIndex(nodes: MappedNode[]): Set<string> {
    const counts = new Map<string, number>()
    for (const n of nodes) {
        const first = n.verdict.tokenized.tokens[0]
        if (!first || first.length < 2) continue
        if (/^(video|ad|hook|hooks|body|cta|callout|script|caption|final)$/i.test(first)) continue
        if (/^\d+$/.test(first)) continue
        counts.set(first, (counts.get(first) ?? 0) + 1)
    }
    const brands = new Set<string>()
    for (const [token, n] of counts) {
        if (n >= 2) brands.add(token)
    }
    return brands
}

// ────────────────────────────────────────────────────────────────────────────
//  §3.7b — Part merge
//  Files sharing (concept, role, index) but carrying different part
//  numbers become ONE node with files[] sorted by part. Single-file nodes
//  stay as-is. Compilation nodes never merge (spec §3.7f).
// ────────────────────────────────────────────────────────────────────────────

/**
 * Intermediate "pre-node" used while the grouper assembles the final
 * VeloxConcept tree. Carries enough state for status chain (§3.7c) and
 * shared/fan-out (§3.7d-e) to operate without re-tokenising.
 */
export interface PreNode {
    /** Stable id derived from concept-key + role + index. */
    id: string
    conceptKey: string
    conceptLabel: string
    conceptSource: 'subfolder' | 'filename' | 'brand_prefix' | 'default'
    role: VeloxRole
    index?: number
    label: string
    status: VeloxStatus
    confidence: number
    band: 'HIGH' | 'REVIEW'
    isCompilation: boolean
    note?: string
    files: VeloxFile[]
    modifiers?: VeloxModifiers
}

/**
 * Group MappedNodes into PreNodes. Inputs must already have the concept
 * key on them (call `resolveConceptKey` beforehand). The merger:
 *
 *   - Buckets by (conceptKey, role, index).
 *   - When a bucket has multiple files with DIFFERENT part numbers, they
 *     merge into one PreNode. Files are stamped with `.part` and sorted
 *     ascending.
 *   - Compilation nodes never merge (each LGR-style "Video N Hooks"
 *     file is its own bucket because conceptKey is "video-N" but each
 *     gets a unique synthetic index).
 *   - Same-bucket duplicates with NO part info take the highest-confidence
 *     verdict and surface a warning on the engine (TODO P2.5 — wire warn).
 */
export interface PartMergeInput {
    node: MappedNode
    conceptKey: string
    conceptLabel: string
    conceptSource: 'subfolder' | 'filename' | 'brand_prefix' | 'default'
}

export function mergeParts(items: PartMergeInput[]): PreNode[] {
    // ─ Pre-process: derive part for each item, and bucket key.
    const enriched = items.map(it => {
        const part = getPart(it.node.file.name)
        return { ...it, part }
    })

    // Bucket key — drives which files merge.
    //
    // Status / replacement suffix prevents collisions on the spec's OBJ
    // case: "H2 NO Use" (status EXCLUDED) and "H2 Replacement" share
    // (concept=Video 1, role=HOOK, index=2) and would collapse into one
    // bucket without a status discriminator. P2.3 then re-pairs them and
    // sets `SUPERSEDED` on the excluded base.
    //
    // Compilation files (spec §3.7f) get a per-file bucket so each
    // "Video N Hooks" stays a distinct node.
    const buckets = new Map<string, typeof enriched>()
    for (const it of enriched) {
        const v = it.node.verdict
        const isReplacement = /\brepla?cement\b|\breplaced\b/i.test(v.tokenized.normalized)
        const statusSuffix =
            v.status === 'EXCLUDED' ? ':excluded' :
            v.status === 'PENDING' ? ':pending' :
            isReplacement ? ':replacement' : ''
        const idxKey = v.isCompilation
            ? `comp:${it.node.file.name}`
            : `${v.index ?? 'noidx'}${statusSuffix}`
        const key = `${it.conceptKey}::${v.role}::${idxKey}`
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key)!.push(it)
    }

    const out: PreNode[] = []
    for (const [key, group] of buckets) {
        const head = group[0]

        // Files with distinct parts merge; otherwise the highest-confidence
        // verdict wins (its tokens/label/status carry through).
        const distinctParts = new Set(group.map(g => g.part).filter(p => p !== undefined))
        const shouldMerge =
            !head.node.verdict.isCompilation &&
            distinctParts.size >= 2 &&
            distinctParts.size === group.filter(g => g.part !== undefined).length &&
            group.length === distinctParts.size

        let winnerIdx = 0
        for (let i = 1; i < group.length; i++) {
            if (group[i].node.verdict.confidence > group[winnerIdx].node.verdict.confidence) {
                winnerIdx = i
            }
        }
        const winner = group[winnerIdx]
        const winnerVerdict = winner.node.verdict

        const files: VeloxFile[] = shouldMerge
            ? [...group]
                .sort((a, b) => (a.part ?? 0) - (b.part ?? 0))
                .map(g => ({ ...g.node.file, part: g.part }))
            : [winner.node.file]

        out.push({
            id: stableNodeId(key),
            conceptKey: head.conceptKey,
            conceptLabel: head.conceptLabel,
            conceptSource: head.conceptSource,
            role: winnerVerdict.role === 'UNKNOWN' ? 'FINAL' : winnerVerdict.role,
            index: winnerVerdict.index,
            label: winnerVerdict.label,
            status: winnerVerdict.status,
            confidence: winnerVerdict.confidence,
            band: winnerVerdict.band,
            isCompilation: winnerVerdict.isCompilation,
            note: winnerVerdict.isCompilation
                ? 'File này chứa nhiều hook khác nhau — cần tách khi dựng.'
                : undefined,
            files,
            modifiers: winnerVerdict.tokenized.modifiers,
        })
    }

    return out
}

// ────────────────────────────────────────────────────────────────────────────
//  §3.7c — Status chain (Replacement supersedes Base; Final lift)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Walks the PreNodes and applies the spec §3.7c relations:
 *
 *   - When a "*Replacement" node exists at (concept, role, index), the
 *     BASE node at the same coordinates flips `status` to SUPERSEDED.
 *     The replacement keeps `status = ACTIVE`. Spec OBJ example:
 *     `H2 NO Use` (EXCLUDED→SUPERSEDED) + `H2 Replacement` (ACTIVE).
 *   - Files tagged FINAL/master OR sitting in an `Exports` folder are
 *     promoted to `role = FINAL`. They're returned in a separate
 *     `finals` array so the engine layers them outside the modular
 *     hook → body → cta fan-out.
 *
 * The function MUTATES `preNodes` in-place (status updates) and returns
 * a `{ active, finals }` split so the caller can map them straight onto
 * `VeloxConcept.nodes` and `VeloxConcept.finals`.
 */
export function applyStatusChain(preNodes: PreNode[]): {
    active: PreNode[]
    finals: PreNode[]
} {
    // 1. Pair Replacement → Base. Index by (concept::role::index) — when a
    //    bucket has both a `:replacement` and a non-replacement variant
    //    (with EXCLUDED or any other status), the non-replacement variant
    //    becomes SUPERSEDED.
    const byCoord = new Map<string, PreNode[]>()
    for (const n of preNodes) {
        if (n.isCompilation) continue            // compilations never chain
        if (n.index === undefined) continue       // shared / named-angle skip
        const k = `${n.conceptKey}::${n.role}::${n.index}`
        if (!byCoord.has(k)) byCoord.set(k, [])
        byCoord.get(k)!.push(n)
    }
    for (const group of byCoord.values()) {
        if (group.length < 2) continue
        const replacements = group.filter(
            n => /\brepla?cement\b|\breplaced\b/i.test(n.files[0]?.name ?? ''),
        )
        if (replacements.length === 0) continue
        for (const n of group) {
            if (replacements.includes(n)) {
                n.status = 'ACTIVE'
                n.note = (n.note ?? '') + (n.note ? ' · ' : '') + 'replaces base variant'
                continue
            }
            n.status = 'SUPERSEDED'
        }
    }

    // 2. Promote FINAL / Exports.
    const finals: PreNode[] = []
    const active: PreNode[] = []
    for (const n of preNodes) {
        const isExports = /\b(exports?|final|master|delivered)\b/i
        const hint =
            isExports.test(n.files[0]?.name ?? '') ||
            n.role === 'FINAL'
        if (hint) {
            n.role = 'FINAL'
            finals.push(n)
        } else {
            active.push(n)
        }
    }

    return { active, finals }
}

// ────────────────────────────────────────────────────────────────────────────
//  §3.7e — Shared asset detection
//  CTA/BODY nodes that landed in the "main" default concept while other
//  named concepts exist promote to SHARED scope. The LGR spec example:
//  Video 1/2/3 + a root-level "Main CTA.mp4" → the CTA links to all three.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns `{ byConcept, shared }`. The input map is partitioned in-place —
 * shared nodes are pulled OUT of the "main" bucket and returned in the
 * `shared` array. If the "main" bucket has zero remaining nodes, it's
 * dropped from the map entirely.
 *
 * Roles eligible for shared promotion: CTA, BODY, SCRIPT, CAPTION. Hooks
 * stay scoped — a hook used by all three videos is logically an asset
 * that needs per-video splitting, not a single shared node.
 */
export function extractSharedAssets(
    byConcept: Map<string, PreNode[]>,
): { byConcept: Map<string, PreNode[]>; shared: PreNode[] } {
    const mainNodes = byConcept.get('main') ?? []
    const otherKeys = [...byConcept.keys()].filter(k => k !== 'main')
    if (otherKeys.length === 0 || mainNodes.length === 0) {
        return { byConcept, shared: [] }
    }

    const SHAREABLE: Array<PreNode['role']> = ['CTA', 'BODY', 'SCRIPT', 'CAPTION']
    const shared: PreNode[] = []
    const remaining: PreNode[] = []
    for (const n of mainNodes) {
        if (SHAREABLE.includes(n.role) && n.status === 'ACTIVE') {
            shared.push(n)
        } else {
            remaining.push(n)
        }
    }

    if (remaining.length === 0) byConcept.delete('main')
    else byConcept.set('main', remaining)

    return { byConcept, shared }
}

// ────────────────────────────────────────────────────────────────────────────
//  §3.7d — Fan-out edges
//  Inside each concept, wire active hook → body → cta. When there's no
//  body, hooks fan to the concept's first FINAL ("Video 1.mov" full-cut).
//  Shared CTAs replace per-concept CTAs when none exist locally.
// ────────────────────────────────────────────────────────────────────────────

export interface BuildEdgesOptions {
    sharedCtas: PreNode[]
    finals: PreNode[]
}

export function buildFanOutEdges(
    nodes: PreNode[],
    opts: BuildEdgesOptions,
): Array<{ from: string; to: string }> {
    const active = nodes.filter(n => n.status === 'ACTIVE' || n.status === 'PENDING')
    const hooks = active.filter(n => n.role === 'HOOK')
    const callouts = active.filter(n => n.role === 'CALLOUT')
    const body = active.find(n => n.role === 'BODY')
    const cta =
        active.find(n => n.role === 'CTA') ??
        opts.sharedCtas.find(n => n.role === 'CTA')

    const edges: Array<{ from: string; to: string }> = []

    if (body) {
        // hook → body
        for (const h of hooks) edges.push({ from: h.id, to: body.id })
        // callout → body (callouts ride into the body lane same as hooks)
        for (const c of callouts) edges.push({ from: c.id, to: body.id })
        if (cta) edges.push({ from: body.id, to: cta.id })
        return edges
    }

    // No body in this concept — hooks/callouts fan to the first FINAL/CTA.
    // Spec §3.7d: "concept không có body riêng (chỉ hooks + full video)
    // → edge hook[i] → finalVideo".
    const sink = opts.finals[0] ?? cta
    if (!sink) return edges
    for (const h of hooks) edges.push({ from: h.id, to: sink.id })
    for (const c of callouts) edges.push({ from: c.id, to: sink.id })
    if (cta && opts.finals[0]) {
        edges.push({ from: opts.finals[0].id, to: cta.id })
    }
    return edges
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
    if (!s) return s
    return s.charAt(0).toUpperCase() + s.slice(1)
}

function stableNodeId(seed: string): string {
    // Tiny deterministic hash → 8-char hex. Good enough for React keys and
    // edge endpoints; not a security primitive.
    let h = 0
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) | 0
    }
    return 'n_' + (h >>> 0).toString(16).padStart(8, '0')
}

// Silence unused import lint — tokenizeFilename is re-exported here for
// downstream P2.3-P2.4 sub-phases that need the same module.
void tokenizeFilename
