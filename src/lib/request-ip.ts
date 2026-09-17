/**
 * [AUDIT HT-002] Canonical client-IP extraction for server actions and route handlers that
 * read headers via `next/headers`.
 *
 * WHY THIS EXISTS AS ONE FUNCTION: the wrong version of this logic —
 * `x-forwarded-for.split(',')[0]` — is a one-liner that looks obviously correct and is
 * therefore easy to re-type. It was re-typed across the auth surface, and each copy silently
 * disabled the rate limit it fed. The audit found the safe order already implemented in three
 * places while five other call sites still used the broken one-liner. Import this; do not
 * hand-roll header parsing again.
 *
 * WHY THE LEFT-MOST TOKEN IS WRONG: on Vercel a client can set `x-forwarded-for` itself. The
 * platform APPENDS the real IP on the right, producing `<attacker-chosen>, <real>`. So `[0]` is
 * always whatever the caller typed — rotate it per request and every per-IP bucket
 * (`rl:login:ip`, `rl:signup:ip`, `rl:otp:ip`) opens fresh. The same value is what lands in
 * LoginAttempt / AuditLog, so a forged header also poisons the forensic trail and can pin
 * activity on an innocent address.
 *
 * ORDER: platform headers first (`x-real-ip`, then `x-vercel-forwarded-for`) because Vercel sets
 * them to the TRUE connecting client and overrides anything the caller sent; only then the
 * RIGHT-most `x-forwarded-for` entry, which is the hop appended by the closest trusted proxy.
 *
 * Route handlers holding a `Request` object should keep using `getClientIp(req)` from
 * `@/lib/review/rate-limit-db` — same order, different input shape.
 */
import { headers } from 'next/headers'

const UNKNOWN = 'unknown-ip'

/** Trusted client IP, or `'unknown-ip'` when no header is usable. Never throws. */
export async function getRequestIpFromHeaders(): Promise<string> {
    try {
        const h = await headers()
        const realIp = h.get('x-real-ip')?.trim()
        if (realIp) return realIp

        const vercelFwd = h.get('x-vercel-forwarded-for')?.split(',').pop()?.trim()
        if (vercelFwd) return vercelFwd

        const parts = (h.get('x-forwarded-for') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        if (parts.length) return parts[parts.length - 1]

        return UNKNOWN
    } catch {
        // Edge runtime / outside a request scope — callers treat this as "no IP".
        return UNKNOWN
    }
}

/**
 * Same resolution, but `null` instead of `'unknown-ip'` for audit columns that are nullable and
 * where a literal string would be indistinguishable from a real value.
 */
export async function getRequestIpOrNull(): Promise<string | null> {
    const ip = await getRequestIpFromHeaders()
    return ip === UNKNOWN ? null : ip
}
