/**
 * [Security · M4 → extracted 2026-06] Server-side input sanitization for
 * free-text CLIENT-facing fields. Moved out of client-portal-actions.ts so
 * the share-link portal (share-portal-actions.ts) shares the exact same
 * hardening after the account portal is removed.
 *
 * UI renders these as React text (auto-escapes), but we cap length + strip
 * HTML defensively for: (a) DoS / DB bloat, (b) surfaces that might render
 * as HTML later (email digest, audit log viewer).
 */
import DOMPurify from 'isomorphic-dompurify'

/** requestDeliverableChanges / requestChangesViaToken feedback cap */
export const FEEDBACK_MAX_LEN = 4000
/** submitTaskRating / submitRatingViaToken qualitativeFeedback cap */
export const RATING_FEEDBACK_MAX_LEN = 2000

export function sanitizeClientText(raw: string, maxLen: number): string {
    // DOMPurify w/ ALLOWED_TAGS:[] → strip all tags, keep plain text.
    const stripped = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    return stripped.trim().slice(0, maxLen)
}
