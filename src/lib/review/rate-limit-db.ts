// [Review module] Fixed-window rate limiter on Postgres (KIEN-TRUC §8.3).
// Backs the GUEST share routes where the in-memory limiter is useless across
// serverless instances. One atomic upsert per check — no vendor, no Redis.
//
// Window semantics: the first hit opens a window; hits inside the window
// increment; a hit after the window expires resets count to 1.

import { prisma } from '@/lib/db'
import { reviewLog } from './logger'

export interface RateLimitResult {
    success: boolean
    remaining: number
    retryAfterSec: number
}

export async function limitDb(
    key: string,
    max: number,
    windowSec: number,
    opts: { failClosed?: boolean } = {},
): Promise<RateLimitResult> {
    const cutoff = new Date(Date.now() - windowSec * 1000)
    try {
        const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
            INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
            VALUES (${key}, now(), 1)
            ON CONFLICT ("key") DO UPDATE SET
                "count"       = CASE WHEN "RateLimitBucket"."windowStart" < ${cutoff} THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
                "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < ${cutoff} THEN now() ELSE "RateLimitBucket"."windowStart" END
            RETURNING "count", "windowStart"
        `
        const row = rows[0]
        const elapsedSec = Math.floor((Date.now() - new Date(row.windowStart).getTime()) / 1000)
        const retryAfterSec = Math.max(1, windowSec - elapsedSec)
        const success = row.count <= max
        if (!success) reviewLog('warn', 'rate_limit.hit', { key, count: row.count, max, windowSec })
        return { success, remaining: Math.max(0, max - row.count), retryAfterSec }
    } catch (e) {
        // Fail-open for availability (guest reads), but log loudly — a broken
        // limiter must be visible, not silent.
        reviewLog('error', 'rate_limit.error', { key, error: String(e) })
        // [AUDIT M5] Brute-force-sensitive callers (e.g. the pre-bcrypt cap on share /unlock) pass
        // failClosed:true so a limiter/DB outage can't silently disable throttling; reads stay fail-open.
        return { success: !opts.failClosed, remaining: 0, retryAfterSec: windowSec }
    }
}

/**
 * Client IP for per-IP rate-limit keys. [G1] The LEFT tokens of a
 * client-supplied `x-forwarded-for` are attacker-chosen, so keying limits on
 * `x-forwarded-for[0]` let a caller defeat every guest throttle (incl. the
 * pre-bcrypt cap on share /unlock) by rotating the header. On Vercel the
 * platform sets `x-real-ip` / `x-vercel-forwarded-for` to the TRUE connecting
 * client IP and overrides client-provided values, so we trust those first and
 * only fall back to the RIGHT-most `x-forwarded-for` entry (the hop added by the
 * closest trusted proxy), never the left-most one.
 */
export function getClientIp(req: Request): string {
    const realIp = req.headers.get('x-real-ip')?.trim()
    if (realIp) return realIp
    const vercelFwd = req.headers.get('x-vercel-forwarded-for')?.split(',').pop()?.trim()
    if (vercelFwd) return vercelFwd
    const xff = req.headers.get('x-forwarded-for')
    if (xff) {
        const parts = xff.split(',').map((s) => s.trim()).filter(Boolean)
        if (parts.length) return parts[parts.length - 1]
    }
    return 'unknown'
}
