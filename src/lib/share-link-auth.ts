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
import { rateLimit } from '@/lib/rate-limit'

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

const TOKEN_RX = /^[A-Za-z0-9_-]{20,128}$/ // base64url of 32 bytes = 43 chars

export function hashShareToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex')
}

/** Best-effort caller IP for rate limiting + audit. */
export async function getRequestIp(): Promise<string> {
    try {
        const h = await headers()
        return (
            h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            h.get('x-real-ip') ||
            'unknown'
        )
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
    opts?: { recordAccess?: boolean },
): Promise<ShareLinkScope | null> {
    if (!rawToken || !TOKEN_RX.test(rawToken)) return null

    // Rate limit token resolution per IP (in-memory: per-instance on Vercel,
    // still kills single-instance burst loops; 256-bit keyspace is the real wall).
    const ip = await getRequestIp()
    const rl = await rateLimit(`share-token:${ip}`, 30, 60_000)
    if (!rl.success) return null

    const link = await prisma.clientShareLink.findUnique({
        where: { tokenHash: hashShareToken(rawToken) },
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
    const profileClients = await prisma.client.findMany({
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
            if (!c) break
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
    const workspaces = await prisma.workspace.findMany({
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
