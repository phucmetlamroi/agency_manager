/**
 * [Canonical Clients 2026-06] Single chokepoint for resolving a public share
 * token → an authorized client scope. EVERY public read/write (page render +
 * each server action in share-portal-actions.ts) re-resolves through here —
 * the token IS the credential, there is no session.
 *
 * Security properties:
 *   - Token never stored: lookup is by SHA-256 hash (hash-at-rest, mirrors
 *     EmailVerificationToken). A DB leak does not leak working links.
 *   - UNIFORM failure: every rejection path (bad format, unknown, revoked,
 *     expired, client merged/deleted, profile deleted, rate-limited) returns
 *     the same `null` → callers render an identical 404. No enumeration
 *     oracle, no revoked-vs-invalid distinction for an attacker.
 *   - Rate limit per IP on resolution — brute-force costs are absurd anyway
 *     (256-bit tokens) but the limiter keeps the DB out of hot loops.
 */
import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { prisma } from '@/lib/db'
import { limitDb } from '@/lib/review/rate-limit-db'

export interface ShareLinkScope {
    /** ClientShareLink.id — for audit provenance + telemetry bumps */
    shareLinkId: string
    profileId: string
    /** Canonical client + its ACTIVE subsidiary subtree */
    clientIds: number[]
    clientId: number
    clientName: string
    profileName: string
    /** ACTIVE workspaces of the profile — task/invoice queries scope to these */
    workspaceIds: string[]
}

// [video-fix ②] Accept 10–128 chars: NEW links are a 12-char base64url (9 bytes, frame.io-style),
// while OLD 43-char (32-byte) links minted before this change still validate — so existing shared
// links keep working. Floor stays ≥10 so a truncated/garbage token is rejected before the DB lookup.
const TOKEN_RX = /^[A-Za-z0-9_-]{10,128}$/

export function hashShareToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
}

/**
 * Best-effort caller IP, for AUDIT provenance.
 *
 * [G1, extended 2026-07] Not a rate-limit key any more — see resolveShareToken. The
 * left-most `x-forwarded-for` token is chosen by the caller, so anything keyed on it is
 * defeated by sending a different value each request. Mirror the trusted-header order that
 * rate-limit-db.ts:getClientIp already uses: platform headers first, then the RIGHT-most
 * forwarded entry (the hop added by the closest trusted proxy), never the left-most.
 */
export async function getRequestIp(): Promise<string> {
    try {
        const h = await headers()
        const realIp = h.get('x-real-ip')?.trim()
        if (realIp) return realIp
        const vercelFwd = h.get('x-vercel-forwarded-for')?.split(',').pop()?.trim()
        if (vercelFwd) return vercelFwd
        const parts = (h.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        if (parts.length) return parts[parts.length - 1]
        return 'unknown'
    } catch {
        return 'unknown'
    }
}

/**
 * Resolve a raw token → scope, or null (uniform failure).
 * Bumps accessCount/lastAccessedAt fire-and-forget when `recordAccess` is set
 * (page-level only — actions don't double-count).
 */
export async function resolveShareToken(
    rawToken: string | undefined | null,
    opts?: {
        recordAccess?: boolean
        /**
         * [round 7] Run every query on THIS client instead of the module-level `prisma`.
         *
         * Exists for exactly one caller: re-deriving scope INSIDE an interactive transaction
         * that already holds the profile advisory lock. Using the global client there would
         * check out a SECOND connection while the transaction holds the first — under load, N
         * concurrent transactions can each hold a connection and then all wait for one that will
         * never come free. That is client-side pool starvation, invisible to Postgres deadlock
         * detection, and it resolves only when timeouts fire.
         */
        db?: Pick<typeof prisma, 'clientShareLink' | 'client' | 'workspace'>
        /**
         * Skip BOTH limiter tiers. Only legitimate when the same request already resolved this
         * token once (and was charged for it): re-validating inside a transaction must not spend
         * a second allowance, because burning the last one would deny the request its own write
         * and report it as "that brand has just changed" — a lie.
         */
        skipRateLimit?: boolean
    },
): Promise<ShareLinkScope | null> {
    if (!rawToken || !TOKEN_RX.test(rawToken)) return null
    const tokenHash = hashShareToken(rawToken)

    // [Authz 2026-07, revised after review] TWO tiers, and the order matters.
    //
    // This is the only throttle on ~15 portal server actions, and the version it replaced was
    // broken three ways: keyed on the LEFT-most x-forwarded-for (caller-chosen, so rotating one
    // header opened a fresh bucket every request), backed by the in-memory Map (one bucket per
    // lambda, so on Vercel it barely applied), and collapsing every visitor of every agency into
    // a single `share-token:unknown` bucket whenever no forwarding header existed.
    //
    // Keying on the token hash fixed all three -- and introduced a new hole, caught in review:
    // the bucket was charged BEFORE the link lookup, so any random 10-char string minted a
    // permanent RateLimitBucket row. An unauthenticated caller could grow that table without
    // limit, holding no token at all. So:
    //
    //   tier 1, per trusted IP, charged first -- bounds guessing at UNKNOWN tokens, and creates
    //           no row keyed on attacker-controlled input. Skipped entirely when the platform
    //           gives us no IP, because one shared 'unknown' bucket is the lockout bug above.
    //   tier 2, per token hash, charged only AFTER the token proves real -- bounds hammering
    //           with a VALID token, unspoofable, and stable per link so one agency office behind
    //           one NAT egress is not one shared bucket.
    //
    // Both fail OPEN: a limiter outage must never present every client with a dead link.
    const db = opts?.db ?? prisma
    if (!opts?.skipRateLimit) {
        const ip = await getRequestIp()
        if (ip !== 'unknown') {
            const ipRl = await limitDb(`share-token-ip:${ip}`, 240, 60, { failClosed: false })
            if (!ipRl.success) return null
        }
    }

    const link = await db.clientShareLink.findUnique({
        where: { tokenHash },
        select: {
            id: true,
            revokedAt: true,
            expiresAt: true,
            profileId: true,
            clientId: true,
            client: { select: { id: true, name: true, status: true, mergedIntoId: true } },
            profile: { select: { id: true, name: true, status: true } },
        },
    })
    if (!link) return null
    if (link.revokedAt) return null
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null
    // [Canonical Clients] A MERGED client is a duplicate the merge migration
    // absorbed into a survivor (an ACTIVE row on the SAME name-path) — its tasks
    // were remapped there. We still honor the link by re-seeding the scope from
    // mergedIntoId below, so a link minted before the merge keeps working ("link
    // cũ không cần tạo lại"). SOFT_DELETED / trashed / missing still 404.
    if (!link.client || (link.client.status !== 'ACTIVE' && link.client.status !== 'MERGED')) return null
    if (!link.profile || link.profile.status !== 'ACTIVE') return null

    // Tier 2, charged only now that the token is proven real — so a random string can never
    // create a bucket row.
    //
    // Deliberately a RUNAWAY BACKSTOP, not the sharp control, and review is why. The token is
    // the credential and there is no per-user session, so a token bucket is SHARED FATE: one
    // person who still has a forwarded link, looping at a few requests a second, would exhaust
    // it and every legitimate viewer at that client would then see the same blank 404 a revoked
    // link shows — no 429, no message, for as long as the loop runs. So the per-IP tier above is
    // set where a single abusive source trips ITSELF first (240/min is ~20-60 ordinary page
    // loads from one address), and this ceiling sits far above any honest usage, catching only a
    // genuinely distributed flood.
    if (!opts?.skipRateLimit) {
        const rl = await limitDb(`share-token:${tokenHash}`, 2000, 60, { failClosed: false })
        if (!rl.success) return null
    }

    // ── Scope: the client's FULL history across the whole profile ──────────
    // [Canonical Clients 2026-06] The merge migration may not have run yet, so
    // the SAME logical client ("Jacob") still exists as many per-workspace
    // duplicate rows with different ids — and the link points at just one of
    // them (often an empty one). Resolving scope by a single id would show a
    // blank page. Instead we identify the client by its hierarchical NAME-PATH
    // within the profile (the exact mechanism Velox note-inheritance uses) and
    // gather EVERY profile client that shares that path, plus all of its
    // sub-brands. This:
    //   - works whether or not the merge migration has run (post-merge only
    //     the survivor is ACTIVE → it holds all the remapped tasks);
    //   - is strictly profile-confined (never crosses profiles);
    //   - keeps a different logical client out: link path "jacob" matches the
    //     root "Jacob" rows + "jacob/<sub>" sub-brands, but NOT "josh/jacob"
    //     (Josh's sub-brand) nor "acme".
    const profileClients = await db.client.findMany({
        where: { profileId: link.profileId, status: 'ACTIVE' },
        select: { id: true, name: true, parentId: true },
    })
    const byId = new Map(profileClients.map((c) => [c.id, c]))
    // The name-path is an ARRAY of normalized ancestor names, NOT a "/"-joined
    // string. "/" is a legal character inside a free-text client name, so a
    // joined string would conflate a single client literally named "Jacob/Unit"
    // with a real Jacob→Unit hierarchy and leak one client's data into the
    // other's share scope (verified High finding). Comparing segment arrays
    // element-by-element makes ["jacob/unit"] (one name) distinct from
    // ["jacob","unit"] (two names). NFC-normalize so accented duplicates merge.
    // A visited-set (not a depth cap) guards against a corrupt parent cycle
    // without truncating deep chains into aliasable prefixes.
    const segPath = (id: number): string[] => {
        const names: string[] = []
        const seen = new Set<number>()
        let cur: number | null = id
        while (cur != null && !seen.has(cur)) {
            seen.add(cur)
            const c = byId.get(cur)
            if (!c) {
                // [Authz 2026-07] An ancestor outside the ACTIVE set (soft-deleted, merged, or
                // left behind by collectClientSubtreeIds, whose cascade stops at depth 8) used
                // to end the path silently — which RE-ROOTED the descendant under its own name.
                // "bob > … > acme" then read as ["acme"] and matched a root client literally
                // named "Acme", pulling an unrelated customer's tasks, invoices and files into
                // this token's scope. Record the break as an unforgeable segment instead: a NUL,
                // written as an explicit escape so it is visible in review and no raw control
                // byte sits in the source. Postgres text cannot hold a NUL, so this marker is
                // unspellable as a client name, and a truncated path can therefore only match
                // ANOTHER descendant of the SAME missing ancestor — exactly the sibling
                // relationship it really has.
                names.push(`\u0000#${cur}`)
                break
            }
            names.push((c.name ?? '').normalize('NFC').trim().toLowerCase())
            cur = c.parentId
        }
        return names.reverse()
    }
    // candidate is the same logical client (its per-workspace duplicates) OR one
    // of its sub-brands iff its segment array starts with the link's, element-wise.
    const startsWithSegs = (full: string[], prefix: string[]): boolean => {
        if (full.length < prefix.length) return false
        for (let i = 0; i < prefix.length; i++) if (full[i] !== prefix[i]) return false
        return true
    }
    // If the link points at a MERGED duplicate, follow it to the survivor (an
    // ACTIVE row in `byId`) so the name-path resolves against the row that now
    // actually holds the tasks. Pre-merge (status ACTIVE) this is a no-op.
    const seedClientId =
        link.client.status === 'MERGED' && link.client.mergedIntoId
            ? link.client.mergedIntoId
            : link.clientId
    const linkSegs = segPath(seedClientId)
    const clientIds = new Set<number>([seedClientId])
    if (linkSegs.length > 0 && linkSegs.every((s) => s.length > 0)) {
        for (const c of profileClients) {
            if (startsWithSegs(segPath(c.id), linkSegs)) clientIds.add(c.id)
        }
    }

    // Include EVERY workspace of the profile — incl. SOFT_DELETED/archived
    // monthly workspaces — so the client sees their full history ("sổ workspace
    // đã làm trước đó"). clientId-scoping already confines tasks to this
    // profile, so this filter is a defensive belt, not the security boundary.
    const workspaces = await db.workspace.findMany({
        where: { profileId: link.profileId },
        select: { id: true },
    })

    if (opts?.recordAccess) {
        // Fire-and-forget telemetry — never block or fail the render on this.
        void prisma.clientShareLink
            .update({
                where: { id: link.id },
                data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
            })
            .catch(() => { /* best-effort */ })
    }

    return {
        shareLinkId: link.id,
        profileId: link.profileId,
        clientIds: Array.from(clientIds),
        clientId: link.clientId,
        clientName: link.client.name,
        profileName: link.profile.name,
        workspaceIds: workspaces.map((w) => w.id),
    }
}
