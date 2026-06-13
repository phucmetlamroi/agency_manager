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
            client: { select: { id: true, name: true, status: true } },
            profile: { select: { id: true, name: true, status: true } },
        },
    })
    if (!link) return null
    if (link.revokedAt) return null
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null
    // Client must still be ACTIVE — a MERGED duplicate or trashed/deleted
    // client kills its links (admin should mint a new link on the survivor).
    if (!link.client || link.client.status !== 'ACTIVE') return null
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
    const pathOf = (id: number): string => {
        const names: string[] = []
        let cur: number | null = id
        let depth = 0
        while (cur != null && depth < 8) {
            const c = byId.get(cur)
            if (!c) break
            names.push((c.name ?? '').trim().toLowerCase())
            cur = c.parentId
            depth++
        }
        return names.reverse().join('/')
    }
    const linkPath = pathOf(link.clientId)
    const clientIds = new Set<number>([link.clientId])
    if (linkPath) {
        const prefix = linkPath + '/'
        for (const c of profileClients) {
            const path = pathOf(c.id)
            // exact same logical client (its duplicates across workspaces) OR
            // one of its sub-brands ("jacob/unit").
            if (path === linkPath || path.startsWith(prefix)) clientIds.add(c.id)
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
