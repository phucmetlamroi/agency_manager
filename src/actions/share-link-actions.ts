'use server'

/**
 * [Canonical Clients 2026-06] Admin-side management of public client share
 * links. Session-gated: ONLY profile OWNER/ADMIN (canManageShareLinks) can
 * create/revoke/list — "không đưa được lung tung".
 *
 * Token lifecycle:
 *   - createClientShareLink returns the raw URL EXACTLY ONCE. Only the
 *     SHA-256 hash is persisted; we cannot show the link again. The UI warns
 *     the admin to copy it immediately (they can always mint a new link and
 *     revoke the old one).
 *   - revokeClientShareLink sets revokedAt — effective immediately because
 *     every public request re-resolves through resolveShareToken.
 */

import { randomBytes } from 'crypto'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { canManageShareLinks, isSessionLive } from '@/lib/profile-permissions'
import { hashShareToken } from '@/lib/share-link-auth'
import { audit } from '@/lib/audit-log'

/** Resolve session + workspace → profile, gate by OWNER/ADMIN. */
async function gateShareLinkAdmin(workspaceId: string) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Unauthorized' as const }
    // [AUDIT HT-025 fix] Re-assert session liveness — a LOCKED account or a revoked session
    // (sessionVersion bumped by "logout all devices" / password reset) must not be able to mint
    // or revoke public share links just because its JWT cookie hasn't expired yet.
    if (!(await isSessionLive(session))) {
        return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' as const }
    }
    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true },
    })
    if (!ws?.profileId) return { error: 'Workspace không thuộc profile nào.' as const }
    const allowed = await canManageShareLinks(session.user.id, ws.profileId)
    if (!allowed) {
        return { error: 'Chỉ OWNER/ADMIN của profile mới được quản lý link chia sẻ.' as const }
    }
    // [BILLING P6] Cổng khách hàng (The Desk) = tính năng gói CLIENT_PORTAL (Studio trở lên).
    // Gate ở helper này nên cả ba action (create/revoke/list) thừa hưởng — đúng ý đồ ban đầu
    // của gateShareLinkAdmin. Chưa cưỡng chế thì requireFeature tự cho qua.
    {
        const { requireFeature, billingErrorMessage } = await import('@/lib/billing/entitlements')
        try { await requireFeature(ws.profileId, 'CLIENT_PORTAL') } catch (e) {
            const msg = billingErrorMessage(e)
            if (msg) return { error: msg }
            throw e
        }
    }
    return { ok: true as const, userId: session.user.id, profileId: ws.profileId }
}

export async function createClientShareLink(clientId: number, workspaceId: string) {
    const gate = await gateShareLinkAdmin(workspaceId)
    if ('error' in gate) return { success: false as const, error: gate.error }

    // Client must belong to this profile and be ACTIVE.
    const client = await prisma.client.findFirst({
        where: { id: clientId, profileId: gate.profileId, status: 'ACTIVE' },
        select: { id: true, name: true },
    })
    if (!client) {
        return { success: false as const, error: 'Khách hàng không tồn tại trong profile này (hoặc đã bị xoá/gộp).' }
    }

    // [video-fix ②] Short frame.io-style token: 9 random bytes → base64url (12 chars, 72-bit).
    // The token IS the credential (hash-at-rest + per-IP rate limit + uniform-404), and 72 bits is
    // infeasible to brute-force under the 30-req/60s limiter. Raw token returned once, never persisted.
    const rawToken = randomBytes(9).toString('base64url')
    const link = await prisma.clientShareLink.create({
        data: {
            tokenHash: hashShareToken(rawToken),
            clientId: client.id,
            profileId: gate.profileId,
            createdById: gate.userId,
        },
        select: { id: true, createdAt: true },
    })

    void audit({
        workspaceId,
        actorUserId: gate.userId,
        action: 'share_link.created',
        targetType: 'ClientShareLink',
        targetId: link.id,
        after: { clientId: client.id, clientName: client.name, profileId: gate.profileId },
    })

    const base = process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz'
    return {
        success: true as const,
        linkId: link.id,
        url: `${base}/share/${rawToken}`,
        createdAt: link.createdAt.toISOString(),
    }
}

export async function revokeClientShareLink(linkId: string, workspaceId: string) {
    const gate = await gateShareLinkAdmin(workspaceId)
    if ('error' in gate) return { success: false as const, error: gate.error }

    // Scope the revoke to this profile — an admin of profile A can't kill
    // profile B's links by guessing ids.
    const link = await prisma.clientShareLink.findFirst({
        where: { id: linkId, profileId: gate.profileId },
        select: { id: true, clientId: true, revokedAt: true },
    })
    if (!link) return { success: false as const, error: 'Không tìm thấy link.' }
    if (link.revokedAt) return { success: false as const, error: 'Link đã bị thu hồi trước đó.' }

    await prisma.clientShareLink.update({
        where: { id: link.id },
        data: { revokedAt: new Date() },
    })

    void audit({
        workspaceId,
        actorUserId: gate.userId,
        action: 'share_link.revoked',
        targetType: 'ClientShareLink',
        targetId: link.id,
        after: { clientId: link.clientId },
    })

    return { success: true as const }
}

export async function listClientShareLinks(clientId: number, workspaceId: string) {
    const gate = await gateShareLinkAdmin(workspaceId)
    if ('error' in gate) return { success: false as const, error: gate.error }

    const links = await prisma.clientShareLink.findMany({
        where: { clientId, profileId: gate.profileId },
        orderBy: { createdAt: 'desc' },
        // NEVER select tokenHash — metadata only.
        select: {
            id: true,
            createdAt: true,
            revokedAt: true,
            expiresAt: true,
            lastAccessedAt: true,
            accessCount: true,
            createdBy: { select: { username: true, nickname: true, displayName: true } },
        },
    })

    return {
        success: true as const,
        links: links.map((l) => ({
            id: l.id,
            createdAt: l.createdAt.toISOString(),
            revokedAt: l.revokedAt?.toISOString() ?? null,
            expiresAt: l.expiresAt?.toISOString() ?? null,
            lastAccessedAt: l.lastAccessedAt?.toISOString() ?? null,
            accessCount: l.accessCount,
            createdByName: l.createdBy?.displayName || l.createdBy?.nickname || l.createdBy?.username || '—',
        })),
    }
}
