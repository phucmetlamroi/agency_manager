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
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
    if (!s) return s
    return s.charAt(0).toUpperCase() + s.slice(1)
}
