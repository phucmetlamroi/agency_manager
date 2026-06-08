/**
 * [Velox v4 — Role Classifier (Pass 2)]
 *
 * For each candidate file (those NOT routed to the Raw tray by triage),
 * decide its role, index, status, confidence and band. Spec §3.4 – §3.6.
 *
 * Two-phase pipeline so siblings can corroborate each other:
 *
 *   1. `classifyFile(file, cfg)` → preliminary verdict using only the
 *      filename + roles config.
 *   2. `applySiblingCorroboration(items)` → for each item, look at its
 *      siblings (same concept-bucket) and bump confidence for HOOK_LETTER
 *      hooks that sit next to clear BODY / CTA files (§3.6).
 *
 * The grouper (P2) builds the concept-bucket list and calls these in order.
 */

import type { VeloxRole, VeloxStatus } from './v4-types'
import { loadRolesConfig, type VeloxRolesConfig } from './v4-roles-loader'
import { RX, tokenizeFilename, type TokenizedFilename } from './v4-tokenizer'

// ────────────────────────────────────────────────────────────────────────────
//  Public verdict shape
// ────────────────────────────────────────────────────────────────────────────

export interface RoleVerdict {
    role: VeloxRole | 'UNKNOWN'
    /** "Hook 1" → 1.  Undefined for named-angle hooks ("open day hook") and
     *  shared nodes ("Main CTA"). */
    index?: number
    /** Free-form display label — already lower-cased + space-normalised. */
    label: string
    status: VeloxStatus
    /** Raw confidence 0..1 (sibling corroboration not yet applied — that's
     *  the second phase). */
    confidence: number
    /** Display band derived from confidence (post-corroboration). */
    band: 'HIGH' | 'REVIEW'
    /** True when the filename signals it bundles multiple hooks ("Hooks" with
     *  no index in the presence of OTHER hooks in the same bucket — the final
     *  flag is set by the grouper, see spec §3.7f). The classifier sets it
     *  whenever the filename word is "hooks" plural with NO index — the
     *  grouper can override based on siblings. */
    isCompilation: boolean
    /** Reasons surfaced for the diagnostic panel + tests. */
    reasons: string[]
    /** Tokenized view of the filename (carried so callers don't re-tokenize). */
    tokenized: TokenizedFilename
}

// ────────────────────────────────────────────────────────────────────────────
//  Phase 1 — classify a single filename in isolation
// ────────────────────────────────────────────────────────────────────────────

export function classifyFile(
    filename: string,
    cfg: VeloxRolesConfig = loadRolesConfig(),
): RoleVerdict {
    const tok = tokenizeFilename(filename)
    const reasons: string[] = []

    // 1. Status sniffing — applied to whatever role we end up with.
    const status = sniffStatus(tok, cfg, reasons)

    // 2. Role detection. Order: explicit roles first (script/caption via
    //    docExt or word), then HOOK_WORD, then BODY/CTA/CALLOUT, then
    //    HOOK_LETTER (lower priority — easy collision). FINAL stays last
    //    because it's a fallback.
    const role = pickRole(tok, cfg, reasons)
    if (role.role === 'UNKNOWN') {
        return {
            role: 'UNKNOWN',
            label: tok.normalized || tok.raw,
            status,
            confidence: 0,
            band: 'REVIEW',
            isCompilation: false,
            reasons: [...reasons, 'no role token recognised'],
            tokenized: tok,
        }
    }

    // 3. Compilation detection — "Hooks" PLURAL with no inline HOOK_LETTER.
    //    "LGR Video 1 Hooks.mov" has trail digit "1" which is the VIDEO
    //    number, NOT a hook index → don't run trail-index resolution at all.
    //    Spec §3.7f: compilation node carries no index, gets a note in UI.
    const isCompilation =
        role.role === 'HOOK' &&
        /\bhooks\b/i.test(tok.normalized) &&
        !RX.HOOK_LETTER.test(tok.normalized)
    if (isCompilation) reasons.push('detected compilation ("Hooks" plural, video-N digit ignored)')

    // 4. Index resolution. Skipped for compilation nodes.
    const idx = isCompilation ? undefined : resolveIndex(role.role, tok)
    if (idx !== undefined) reasons.push(`index resolved → ${idx}`)

    // 5. Confidence — base × positionFactor (sibling adjust comes later).
    const positionFactor = role.endPosition ? 1.0 : 0.9
    let confidence = clamp(role.base * positionFactor, 0, 1)
    reasons.push(`base=${role.base.toFixed(2)} × positionFactor=${positionFactor.toFixed(1)} → ${confidence.toFixed(2)}`)

    // 6. Label.
    const label = isCompilation
        ? buildCompilationLabel(tok)
        : buildLabel(role.role, idx, tok)

    // 7. Band — initial guess; the engine overwrites after corroboration.
    const band: 'HIGH' | 'REVIEW' = confidence >= 0.85 ? 'HIGH' : 'REVIEW'

    return {
        role: role.role,
        index: idx,
        label,
        status,
        confidence,
        band,
        isCompilation,
        reasons,
        tokenized: tok,
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Phase 2 — sibling corroboration
//  Spec §3.6: +0.25 if the same concept-bucket contains ≥1 file whose role
//  comes from a role-WORD match (not letter-form). Practical effect: H1 next
//  to "Body.mov" gets a boost so its band flips from REVIEW → HIGH.
// ────────────────────────────────────────────────────────────────────────────

export interface CorroborationBucket {
    /** Free-form key (e.g. concept id). Items inside same bucket corroborate
     *  each other. */
    key: string
    items: RoleVerdict[]
}

export function applySiblingCorroboration(buckets: CorroborationBucket[]): void {
    for (const b of buckets) {
        const hasWordHook = b.items.some(
            i => i.role === 'HOOK' && wordTokenPresent('HOOK_WORD', i.tokenized),
        )
        const hasWordBody = b.items.some(
            i => i.role === 'BODY' && wordTokenPresent('BODY', i.tokenized),
        )
        const hasWordCta = b.items.some(
            i => i.role === 'CTA' && wordTokenPresent('CTA', i.tokenized),
        )
        const anchor = hasWordHook || hasWordBody || hasWordCta
        if (!anchor) continue

        for (const v of b.items) {
            // Only boost HOOK_LETTER hooks (`H1`, `H03`) — they're the band
            // the spec spotlights ("H1 alone with no Body/CTA cousin → 0.65").
            const isLetterHook =
                v.role === 'HOOK' &&
                v.tokenized.normalized.match(RX.HOOK_LETTER) &&
                !v.tokenized.normalized.match(RX.HOOK_WORD)
            if (!isLetterHook) continue
            const before = v.confidence
            v.confidence = clamp(v.confidence + 0.25, 0, 1)
            v.band = v.confidence >= 0.85 ? 'HIGH' : 'REVIEW'
            v.reasons.push(
                `sibling corroboration +0.25 (anchor=${hasWordHook ? 'HOOK' : ''}${hasWordBody ? 'BODY' : ''}${hasWordCta ? 'CTA' : ''}) ${before.toFixed(2)}→${v.confidence.toFixed(2)}`,
            )
        }
    }

    // Re-evaluate bands for everyone (some non-letter items may also cross
    // the 0.85 threshold via P5 overrides; cheap pass).
    for (const b of buckets) {
        for (const v of b.items) {
            v.band = v.confidence >= 0.85 ? 'HIGH' : 'REVIEW'
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
//  Internals
// ────────────────────────────────────────────────────────────────────────────

interface RoleHit {
    role: VeloxRole
    base: number
    /** True if the role token sits at the END of the normalized name
     *  (modifiers stripped). Used for positionFactor. */
    endPosition: boolean
}

function pickRole(
    tok: TokenizedFilename,
    cfg: VeloxRolesConfig,
    reasons: string[],
): RoleHit | { role: 'UNKNOWN'; base: 0; endPosition: false } {
    const n = tok.normalized

    // 0. Doc-extension shortcuts — script.pdf, captions.srt
    if (tok.ext) {
        for (const r of cfg.roles) {
            if (!r.docExt) continue
            if (r.docExt.includes(tok.ext)) {
                reasons.push(`role ${r.role} via docExt .${tok.ext}`)
                // Doc roles considered "word-level" confidence.
                return { role: r.role, base: 0.95, endPosition: true }
            }
        }
    }

    // 1. Role-word matches (priority order from spec — HOOK > CTA > BODY
    //    > CALLOUT > SCRIPT > CAPTION > FINAL).
    if (RX.HOOK_WORD.test(n)) {
        reasons.push('HOOK_WORD matched')
        return { role: 'HOOK', base: 0.95, endPosition: isTokenAtEnd(n, RX.HOOK_WORD) }
    }
    if (RX.CTA.test(n)) {
        reasons.push('CTA word matched')
        return { role: 'CTA', base: 0.95, endPosition: isTokenAtEnd(n, RX.CTA) }
    }
    if (RX.BODY.test(n)) {
        reasons.push('BODY word matched')
        return { role: 'BODY', base: 0.95, endPosition: isTokenAtEnd(n, RX.BODY) }
    }
    if (RX.CALLOUT.test(n)) {
        reasons.push('CALLOUT word matched')
        return { role: 'CALLOUT', base: 0.95, endPosition: isTokenAtEnd(n, RX.CALLOUT) }
    }
    if (RX.SCRIPT.test(n)) {
        reasons.push('SCRIPT word matched')
        return { role: 'SCRIPT', base: 0.95, endPosition: isTokenAtEnd(n, RX.SCRIPT) }
    }
    if (RX.CAPTION.test(n)) {
        reasons.push('CAPTION word matched')
        return { role: 'CAPTION', base: 0.95, endPosition: isTokenAtEnd(n, RX.CAPTION) }
    }

    // 2. HOOK_LETTER fallback — "H1", "h03". Lower confidence; sibling
    //    corroboration can boost it.
    if (RX.HOOK_LETTER.test(n)) {
        reasons.push('HOOK_LETTER matched (low-confidence)')
        return { role: 'HOOK', base: 0.65, endPosition: isTokenAtEnd(n, RX.HOOK_LETTER) }
    }

    // 3. Config-driven alias fallback — covers anything the regex table
    //    misses (e.g. per-client "opener", "pi"). Hits get word-level
    //    base since they're explicit.
    for (const r of cfg.roles) {
        for (const a of r.aliases) {
            if (!a) continue
            if (n.includes(a.toLowerCase())) {
                reasons.push(`role ${r.role} via alias "${a}"`)
                return { role: r.role, base: 0.95, endPosition: n.endsWith(a.toLowerCase()) }
            }
        }
    }

    // 4. FINAL fallback — "ad" / "video N" stand-alone with no other role.
    if (/\bvideo\s*\d+\b|\bad\s*\d+\b/.test(n)) {
        reasons.push('FINAL fallback via "video N" / "ad N"')
        return { role: 'FINAL', base: 0.7, endPosition: true }
    }

    return { role: 'UNKNOWN', base: 0, endPosition: false }
}

function resolveIndex(role: VeloxRole, tok: TokenizedFilename): number | undefined {
    // HOOK_LETTER: capture group is index.
    if (role === 'HOOK') {
        const m = tok.normalized.match(RX.HOOK_LETTER)
        if (m?.[1]) return parseInt(m[1], 10)
    }
    // Trail index — last standalone number after modifiers stripped.
    const m = tok.normalized.match(RX.TRAIL_INDEX)
    if (m?.[1]) return parseInt(m[1], 10)
    return undefined
}

function sniffStatus(
    tok: TokenizedFilename,
    cfg: VeloxRolesConfig,
    reasons: string[],
): VeloxStatus {
    const n = tok.normalized

    if (RX.ST_EXCLUDE.test(n)) {
        reasons.push('status EXCLUDED via regex')
        return 'EXCLUDED'
    }
    if (RX.ST_REPLACE.test(n)) {
        reasons.push('status REPLACEMENT via regex (will SUPERSEDE base in grouper)')
        return 'ACTIVE'
    }
    if (RX.ST_PENDING.test(n)) {
        reasons.push('status PENDING via regex')
        return 'PENDING'
    }

    // Config-driven status overrides (P5 allows per-client extensions).
    for (const t of cfg.status.EXCLUDED) {
        if (n.includes(t.toLowerCase())) {
            reasons.push(`status EXCLUDED via alias "${t}"`)
            return 'EXCLUDED'
        }
    }
    for (const t of cfg.status.PENDING) {
        if (n.includes(t.toLowerCase())) {
            reasons.push(`status PENDING via alias "${t}"`)
            return 'PENDING'
        }
    }
    return 'ACTIVE'
}

/** Compilation labels keep the full normalised phrase (e.g. "video 1 hooks")
 *  so the UI can show "Video 1 Hooks" verbatim — the user needs the original
 *  context to decide which hook to use when editing. */
function buildCompilationLabel(tok: TokenizedFilename): string {
    return tok.normalized.trim()
}

function buildLabel(role: VeloxRole, idx: number | undefined, tok: TokenizedFilename): string {
    // Special-case: named-angle hooks keep their freeform label so the UI can
    // surface "open day hook" verbatim.
    if (role === 'HOOK' && idx === undefined) {
        const stripped = tok.normalized
            .replace(/\bhooks?\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
        if (stripped.length > 0) return stripped + ' hook'
    }
    if (idx !== undefined) {
        const pretty = role.charAt(0) + role.slice(1).toLowerCase()
        return `${pretty} ${idx}`
    }
    // Fallback: capitalise the role.
    return role.charAt(0) + role.slice(1).toLowerCase()
}

function isTokenAtEnd(normalized: string, rx: RegExp): boolean {
    const m = normalized.match(rx)
    if (!m || m.index === undefined) return false
    const tail = normalized.slice(m.index + m[0].length).trim()
    // Allow at most one trailing number (the index) after the role token.
    return tail.length === 0 || /^\d+$/.test(tail)
}

function wordTokenPresent(kind: keyof typeof RX, tok: TokenizedFilename): boolean {
    const rx = RX[kind]
    if (!(rx instanceof RegExp)) return false
    return rx.test(tok.normalized)
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, x))
}
