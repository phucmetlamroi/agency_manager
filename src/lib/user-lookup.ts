/**
 * [Auth · Email-deterministic lookup]
 *
 * `User.email` is currently `String?` (NOT `@unique`) in the schema — duplicate
 * accounts with the same email can exist (Google OAuth signup + legacy email
 * signup colliding, soft-deleted account leftover, etc.).
 *
 * Using `prisma.user.findFirst({ where: { email: X } })` returns a
 * NON-DETERMINISTIC row when duplicates exist — the invitation may be created
 * for the "wrong" account while the user logs in with the other one. The user
 * then sees no invitation in their inbox, or sees one whose CAS update fails
 * because `invitedUserId` doesn't match `session.user.id`.
 *
 * Until the schema enforces `@@unique([email])` and a backfill consolidates
 * duplicates, ALL email-based user lookups (invite, login fallback, password
 * reset) should go through this helper. It:
 *
 *   1. Treats `@`-containing input as email; else as username
 *   2. Username matches are inherently unique (`@unique`) — single lookup
 *   3. Email matches are sorted by (a) emailVerified desc, (b) googleId
 *      presence (Google OAuth account "wins" since active users now log in via
 *      Google), (c) lastLoginAt desc (most-recent-active wins), (d) createdAt
 *      desc (newer wins as tiebreak)
 *   4. Reports the count so callers can decide whether to refuse or warn
 */

import { prisma } from '@/lib/db'

export interface UserLookupResult<T> {
    user: T | null
    /** Count of rows that matched the email lookup (1 = unique; >1 = duplicates exist) */
    matchCount: number
}

/**
 * Deterministic user lookup by email-or-username for invite / login / reset
 * flows. The generic `select` parameter mirrors Prisma's select shape.
 */
export async function findUserByEmailOrUsername<T extends Record<string, unknown>>(
    rawInput: string,
    select: Record<string, boolean>,
): Promise<UserLookupResult<T>> {
    const input = (rawInput ?? '').trim()
    if (!input) return { user: null, matchCount: 0 }

    const isEmail = input.includes('@')

    if (!isEmail) {
        // Username path — already @unique, deterministic.
        const user = await prisma.user.findFirst({
            where: { username: { equals: input, mode: 'insensitive' } },
            select,
        }) as T | null
        return { user, matchCount: user ? 1 : 0 }
    }

    // Email path — sort by activity to pick a stable "winner" if duplicates exist.
    const matches = await prisma.user.findMany({
        where: { email: { equals: input, mode: 'insensitive' } },
        select: {
            ...select,
            // We need these for ordering even if caller didn't ask for them.
            id: true,
            googleId: true,
            emailVerified: true,
            lastLoginAt: true,
            createdAt: true,
        },
        orderBy: [
            { emailVerified: 'desc' },
            { googleId: { sort: 'desc', nulls: 'last' } },
            { lastLoginAt: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
        ],
    }) as unknown as Array<T & { id: string }>

    if (matches.length === 0) return { user: null, matchCount: 0 }
    if (matches.length > 1) {
        console.warn(
            `[findUserByEmailOrUsername] DUPLICATE email lookup for "${input}" — ${matches.length} matches. ` +
            `Picked id=${matches[0].id}. Run scripts/audit-duplicate-emails.mjs to consolidate.`,
        )
    }
    return { user: matches[0], matchCount: matches.length }
}
