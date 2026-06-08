/**
 * [Velox v4 — Tokenizer]
 *
 * Filename → normalized tokens + extracted modifiers (duration, part,
 * audience, version). Spec §3.3 + §3.5.
 *
 * Critical order — extract modifiers BEFORE running role-index regex
 * (§3.5 warning). Otherwise `"Body 2 20 seconds"` will resolve to
 * index = 20 (the trailing number) instead of index = 2.
 *
 * This module is PURE — no I/O, no async, no dependencies on the cloud
 * scanner. Fully testable by passing strings.
 */

import type { VeloxModifiers } from './v4-types'

// ────────────────────────────────────────────────────────────────────────────
//  Public API
// ────────────────────────────────────────────────────────────────────────────

export interface TokenizedFilename {
    /** Lowercased + normalized base filename (no extension) */
    normalized: string
    /** Space-separated tokens after separator collapse */
    tokens: string[]
    /** Extracted modifiers — duration/aspect/audience/version */
    modifiers: VeloxModifiers
    /** Optional file extension (lowercase, no dot) — used by role classifier
     *  to apply `docExt` rules (.pdf → SCRIPT, .srt → CAPTION). */
    ext: string
    /** Original filename for diagnostics */
    raw: string
}

/**
 * Tokenize a filename. Order of operations matters — see spec §3.5 warning.
 */
export function tokenizeFilename(filename: string): TokenizedFilename {
    const raw = filename
    const ext = extractExt(filename).toLowerCase()
    let work = stripExt(filename).normalize('NFC')

    // 1. CamelCase split BEFORE lowercasing — "ProblemSolution" → "Problem Solution"
    work = work.replace(/([a-z])([A-Z])/g, '$1 $2')
    work = work.toLowerCase()

    // 2. Extract modifiers in order (duration → part → audience → version).
    //    Each extractor removes the matched substring from `work` so the
    //    later role-index pass sees a clean string.
    const modifiers: VeloxModifiers = {}

    const dur = extractDuration(work)
    if (dur.value !== undefined) {
        modifiers.durationSec = dur.value
        work = dur.cleaned
    }

    const part = extractPart(work)
    if (part.value !== undefined) {
        // Stored on file, not on node — node gets it via VeloxFile.part.
        // We still strip from `work` so the index regex sees "hook 1" not
        // "hook 1 part 2".
        work = part.cleaned
    }

    const aud = extractAudience(work)
    if (aud.value !== undefined) {
        modifiers.audience = aud.value
        work = aud.cleaned
    }

    const asp = extractAspect(work)
    if (asp.value !== undefined) {
        modifiers.aspect = asp.value
        work = asp.cleaned
    }

    const ver = extractVersion(work)
    if (ver.value !== undefined) {
        modifiers.version = ver.value
        work = ver.cleaned
    }

    // 3. Collapse separators → spaces, then split into tokens.
    work = work
        .replace(/[_|]+/g, ' ')                  // _ and | are separators
        .replace(/[()[\]{}]/g, ' ')              // brackets are separators
        .replace(/\s*-\s*/g, ' - ')              // normalize hyphen spacing
        .replace(/([a-z])([0-9])/g, '$1 $2')     // split "hook1" → "hook 1"
        .replace(/([0-9])([a-z])/g, '$1 $2')     // and "1hook" → "1 hook"
        .replace(/\s+/g, ' ')
        .trim()

    const tokens = work.split(' ').filter(Boolean)
    return { normalized: work, tokens, modifiers, ext, raw }
}

/** Re-export the part index for callers that don't need the full tokenize. */
export function getPart(filename: string): number | undefined {
    const m = filename.match(RX.PART)
    if (!m) return undefined
    const n = parseInt(m[1] ?? '', 10)
    return Number.isFinite(n) ? n : undefined
}

// ────────────────────────────────────────────────────────────────────────────
//  Regex table — spec §3.5 (verbatim, with comments)
// ────────────────────────────────────────────────────────────────────────────

export const RX = {
    // ─ Role keyword ────────────────────────────────────────────────────────
    HOOK_WORD: /\b(hooks?|hk)\b/i,
    /** "H1" / "H 2" / "h03" — capture group #1 = index */
    HOOK_LETTER: /\bh\s?0*([1-9]\d?)\b/i,
    BODY: /\bbody\b/i,
    CTA: /\b(c\s?t\s?a|call\s*to\s*action|main\s*cta|ctas?)\b/i,
    CALLOUT: /\b(audience\s*)?call[\s-]?out\b/i,
    SCRIPT: /\b(script|vo\s*script)\b|\.(txt|docx?|pdf)$/i,
    CAPTION: /\b(caption|captions|subs?|subtitles?|cc)\b|\.(srt|vtt)$/i,

    // ─ Index + part ────────────────────────────────────────────────────────
    /** Trailing standalone number — the LAST occurrence, used after
     *  modifiers have been stripped. NB: anchored to word boundaries so
     *  leading zeros are tolerated ("Hook 03" → 3). */
    TRAIL_INDEX: /\b0*([1-9]\d?)\b(?!.*\b0*[1-9]\d?\b)/,
    /** "(part 2)" / "part 2" — capture group #1 = part index */
    PART: /\bpart\s*0*([1-9]\d?)\b/i,

    // ─ Modifiers ───────────────────────────────────────────────────────────
    DURATION: /\b(\d{1,3})\s*(s|sec|secs|second|seconds)\b/i,
    ASPECT: /\b(\d{1,2})\s*[x:]\s*(\d{1,2})\b|\b(vertical|vert|square|portrait|landscape)\b/i,
    VERSION: /\bv\s?0*(\d+)\b/i,
    /** Content inside the FIRST `(...)` — used for audience/angle hints. */
    AUDIENCE: /\(([^)]+)\)/,

    // ─ Status tokens (applied at node-grouping time, not here) ─────────────
    ST_EXCLUDE: /\b(no\s*use|non\s*use|not\s*use|don'?t\s*use|do\s*not\s*use|unused)\b/i,
    ST_REPLACE: /\b(replacement|replaced)\b/i,
    ST_PENDING: /\b(future\s*edits?|wip|tbc|draft|placeholder)\b/i,
    ST_FINAL: /\b(final|approved|master|delivered)\b/i,

    // ─ Raw-dump default names ──────────────────────────────────────────────
    RAW_DUMP:
        /^(nested\s*sequence|sequence|comp|render|export|clip|untitled)\s*\d+|^(dsc|img|mvi|gopr|dji|c)\d{3,5}\b|^\d+$/i,
} as const

// ────────────────────────────────────────────────────────────────────────────
//  Modifier extractors — each returns { value, cleaned }. Cleaned is the
//  original work string with the matched substring removed.
// ────────────────────────────────────────────────────────────────────────────

function extractDuration(s: string): { value?: number; cleaned: string } {
    const m = s.match(RX.DURATION)
    if (!m) return { cleaned: s }
    const value = parseInt(m[1] ?? '', 10)
    if (!Number.isFinite(value)) return { cleaned: s }
    const cleaned = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim()
    return { value, cleaned }
}

function extractPart(s: string): { value?: number; cleaned: string } {
    const m = s.match(RX.PART)
    if (!m) return { cleaned: s }
    const value = parseInt(m[1] ?? '', 10)
    if (!Number.isFinite(value)) return { cleaned: s }
    const cleaned = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim()
    return { value, cleaned }
}

function extractAudience(s: string): { value?: string; cleaned: string } {
    const m = s.match(RX.AUDIENCE)
    if (!m) return { cleaned: s }
    const value = m[1].trim()
    if (!value) return { cleaned: s }
    const cleaned = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim()
    return { value, cleaned }
}

function extractAspect(s: string): { value?: string; cleaned: string } {
    const m = s.match(RX.ASPECT)
    if (!m) return { cleaned: s }
    const value = (m[1] && m[2]) ? `${m[1]}:${m[2]}` : (m[3] ?? '').toLowerCase()
    if (!value) return { cleaned: s }
    const cleaned = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim()
    return { value, cleaned }
}

function extractVersion(s: string): { value?: string; cleaned: string } {
    const m = s.match(RX.VERSION)
    if (!m) return { cleaned: s }
    const value = `v${m[1]}`
    const cleaned = (s.slice(0, m.index!) + s.slice(m.index! + m[0].length)).trim()
    return { value, cleaned }
}

// ────────────────────────────────────────────────────────────────────────────
//  Tiny utilities
// ────────────────────────────────────────────────────────────────────────────

function extractExt(name: string): string {
    const i = name.lastIndexOf('.')
    if (i < 0 || i === name.length - 1) return ''
    return name.slice(i + 1)
}

function stripExt(name: string): string {
    const i = name.lastIndexOf('.')
    if (i < 0) return name
    return name.slice(0, i)
}
