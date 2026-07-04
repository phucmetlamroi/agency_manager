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
        return { success: true, remaining: 0, retryAfterSec: windowSec }
    }
}

/** First-hop client IP (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
    return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}
