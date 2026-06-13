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

    // Scope: canonical client + ACTIVE subsidiary subtree (bounded depth,
    // same pattern as crm-actions collectClientSubtreeIds).
    const clientIds = new Set<number>([link.clientId])
    let frontier = [link.clientId]
    let guard = 0
    while (frontier.length > 0 && guard < 8) {
        const children = await prisma.client.findMany({
            where: { parentId: { in: frontier }, status: 'ACTIVE', profileId: link.profileId },
            select: { id: true },
        })
        const next: number[] = []
        for (const c of children) {
            if (!clientIds.has(c.id)) { clientIds.add(c.id); next.push(c.id) }
        }
        frontier = next
        guard++
    }

    const workspaces = await prisma.workspace.findMany({
        where: { profileId: link.profileId, status: 'ACTIVE' },
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
