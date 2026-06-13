/**
 * [Security · M4 → extracted 2026-06] Server-side input sanitization for
 * free-text CLIENT-facing fields, shared by the share-link portal
 * (share-portal-actions.ts).
 *
 * [Hotfix 2026-06-13] Dependency-free implementation. The previous
 * isomorphic-dompurify version pulled jsdom → html-encoding-sniffer →
 * "@exodus/bytes" (ESM-only), which crashed every importing route on Vercel
 * with ERR_REQUIRE_ESM ("require() of ES Module ... not supported") —
 * Vercel's Node runtime lacks require(esm), while local Node 24 allows it,
 * so the bug only surfaced in production (500 on /share/[token]).
 *
 * Threat model: these values are STORED AS PLAIN TEXT and every render
 * surface escapes them (React text nodes; audit viewer renders as text).
 * Stripping tags here is defense-in-depth against a future surface that
 * renders raw HTML (email digest etc.), plus DoS/DB-bloat caps — identical
 * guarantees to the old DOMPurify ALLOWED_TAGS:[] config for this use-case.
 */

/** requestDeliverableChanges / requestChangesViaToken feedback cap */
export const FEEDBACK_MAX_LEN = 4000
/** submitTaskRating / submitRatingViaToken qualitativeFeedback cap */
export const RATING_FEEDBACK_MAX_LEN = 2000

/**
 * Drop ASCII control characters except TAB (9) and LF (10) so multi-line
 * feedback stays readable. Implemented via code-point comparison instead of
 * a regex character class to avoid escape-sequence pitfalls.
 */
function stripControlChars(input: string): string {
    let out = ''
    for (const ch of input) {
        const c = ch.codePointAt(0) as number
        const isAllowed = c === 9 || c === 10 || (c >= 32 && c !== 127)
        if (isAllowed) out += ch
    }
    return out
}

export function sanitizeClientText(raw: string, maxLen: number): string {
    let s = stripControlChars(String(raw))
    // Iteratively strip tag-like sequences until stable so nested/malformed
    // payloads ("<<b>script>alert(1)</script>") can't reassemble into a tag
    // after one pass. The optional ">" also removes a dangling unterminated
    // "<..." tail.
    let prev: string
    do {
        prev = s
        s = s.replace(/<[^>]*>?/g, '')
    } while (s !== prev)
    return s.trim().slice(0, maxLen)
}
