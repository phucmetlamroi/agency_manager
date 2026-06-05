import { rateLimit } from '@/lib/rate-limit'

/**
 * [Security · Phase 6] Per-user rate caps on chat write actions. Defends against:
 *   - editMessage / toggleReaction storms (no slow-mode coverage; the playbook's
 *     "reaction storm" + edit-as-rate-bypass scenarios)
 *   - sendMessage flood (slow-mode is channel-config + bypassed for owner/mod; this
 *     is the global per-user backstop)
 *   - wiki autosave hot-loop bypassing the 800ms client debounce
 *
 * Caps are intentionally generous so legitimate fast typing / fast reacting is
 * never blocked; only sustained abuse trips them. In-memory store is per-instance
 * (Vercel cold-starts reset it) — adequate for burst defence per src/lib/rate-limit.ts.
 */

const LIMITS = {
    sendMessage: { limit: 30, windowMs: 10_000 }, // 30 msgs / 10s — well above any human pace
    editMessage: { limit: 30, windowMs: 60_000 }, // 30 edits / minute
    reaction: { limit: 60, windowMs: 10_000 }, // 60 toggles / 10s
    wikiSave: { limit: 60, windowMs: 60_000 }, // 60 autosaves / minute per page
} as const

type LimitKind = keyof typeof LIMITS

/**
 * Check the per-user limit for a given chat write action. Returns `null` on success
 * or an error message (ready to return to the client as `{ error }`).
 */
export async function checkChatWriteLimit(kind: LimitKind, userId: string): Promise<string | null> {
    const { limit, windowMs } = LIMITS[kind]
    const res = await rateLimit(`chat:${kind}:${userId}`, limit, windowMs)
    if (res.success) return null
    const retry = res.headers['Retry-After'] ?? '60'
    return `Bạn thao tác quá nhanh. Hãy đợi ${retry}s rồi thử lại.`
}
