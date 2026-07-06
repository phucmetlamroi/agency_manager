// [Review module P5.1] Guest share auth — the ONE gate every /r/{slug} page render
// and /api/r/{slug}/* request goes through (KIEN-TRUC §3.3). Guests never touch
// requireReviewAccess: all their rights derive from the ShareLink row.
//
// Gate order is a CONTRACT (API-SPEC §0): SHARE_NOT_FOUND(404) → SHARE_REVOKED(410)
// → SHARE_EXPIRED(410) → SHARE_PASSWORD_REQUIRED(401). Missing and revoked slugs
// must be indistinguishable in the MESSAGE (anti-enumeration) even though the
// status code differs per spec.
//
// Two cookies, both scoped per slug so one browser can hold many shares:
//   rv_unlock_{slug} — JWT HS256 {sid} signed with REVIEW_COOKIE_SECRET; proves a
//                      correct password entry. TTL min(24h, share expiry).
//   rv_guest_{slug}  — 32-byte random token; DB stores ONLY sha256(token) on
//                      GuestSession (schema contract). TTL 30 days.
// Cookie path is "/" (NOT /r/{slug} as KIEN-TRUC sketched) because the API lives
// under /api/r/{slug}/* — a path-scoped cookie would never reach it.

import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { GuestSession, ShareLink, ShareLinkItem } from '@prisma/client'
import { prisma } from '@/lib/db'
import { apiError } from './errors'
import { reviewLog } from './logger'

/** Anything with `.get(name)` → `{ value } | undefined` — fits both NextRequest.cookies
 *  and next/headers cookies() so the RSC page and route handlers share one resolver. */
export interface CookieReader {
    get(name: string): { value: string } | undefined
}

export type ShareWithItems = ShareLink & { items: ShareLinkItem[] }

export const unlockCookieName = (slug: string) => `rv_unlock_${slug}`
export const guestCookieName = (slug: string) => `rv_guest_${slug}`
/** Event-throttle cookie (link_opened / asset_viewed debounce, FR-F06). */
export const throttleCookieName = (slug: string) => `rv_t_${slug}`

const UNLOCK_TTL_SEC = 24 * 60 * 60
export const GUEST_COOKIE_TTL_SEC = 30 * 24 * 60 * 60
const SLUG_RE = /^[A-Za-z0-9_-]{8,24}$/ // nanoid(12); reject junk before touching the DB

function cookieSecret(): Uint8Array {
    const raw = process.env.REVIEW_COOKIE_SECRET
    if (!raw || raw.length < 16) {
        throw new Error('[review/share-auth] REVIEW_COOKIE_SECRET missing or too short (need 32+ random bytes)')
    }
    return new TextEncoder().encode(raw)
}

const sha256hex = (s: string) => createHash('sha256').update(s).digest('hex')

// ─────────────────────────── resolve chain ───────────────────────────

export type ShareGate =
    | { state: 'ok'; share: ShareWithItems }
    | { state: 'not_found' }
    | { state: 'revoked' }
    | { state: 'expired' }
    | { state: 'password'; share: ShareWithItems }

/**
 * Non-throwing resolver for the RSC page — the page renders a full-screen gate
 * per state (UI-UX §6.4) instead of an error envelope.
 */
export async function resolveShareGate(slug: string, cookies: CookieReader): Promise<ShareGate> {
    if (!SLUG_RE.test(slug)) return { state: 'not_found' }
    const share = await prisma.shareLink.findUnique({ where: { slug }, include: { items: true } })
    if (!share) return { state: 'not_found' }
    if (share.revokedAt) return { state: 'revoked' }
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) return { state: 'expired' }
    if (share.passwordHash) {
        const ok = await verifyUnlockCookie(share, cookies.get(unlockCookieName(slug))?.value)
        if (!ok) return { state: 'password', share }
    }
    return { state: 'ok', share }
}

/**
 * Throwing resolver for API routes — maps each gate to the specced envelope
 * (English messages; guest-facing). Every /api/r/* handler calls this FIRST.
 */
export async function requireShare(slug: string, cookies: CookieReader): Promise<ShareWithItems> {
    const gate = await resolveShareGate(slug, cookies)
    switch (gate.state) {
        case 'ok':
            return gate.share
        case 'not_found':
            throw apiError(404, 'SHARE_NOT_FOUND', 'This link is no longer available.')
        case 'revoked':
            // Same MESSAGE as not_found — a prober learns nothing from the copy.
            reviewLog('warn', 'share.auth_fail', { slug6: slug.slice(0, 6), reason: 'revoked' })
            throw apiError(410, 'SHARE_REVOKED', 'This link is no longer available.')
        case 'expired':
            throw apiError(410, 'SHARE_EXPIRED', 'This link has expired.')
        case 'password':
            throw apiError(401, 'SHARE_PASSWORD_REQUIRED', 'This link is password protected.')
    }
}

// ─────────────────────────── unlock cookie (password shares) ───────────────────────────

/** Mint the unlock JWT after a correct password (unlock route). */
export async function mintUnlockToken(share: ShareLink): Promise<{ value: string; maxAgeSec: number }> {
    const now = Math.floor(Date.now() / 1000)
    let ttl = UNLOCK_TTL_SEC
    if (share.expiresAt) {
        ttl = Math.min(ttl, Math.max(60, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)))
    }
    const value = await new SignJWT({ sid: share.id })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(now)
        .setExpirationTime(now + ttl)
        .sign(cookieSecret())
    return { value, maxAgeSec: ttl }
}

async function verifyUnlockCookie(share: ShareLink, cookieValue: string | undefined): Promise<boolean> {
    if (!cookieValue) return false
    try {
        const { payload } = await jwtVerify(cookieValue, cookieSecret(), { algorithms: ['HS256'] })
        return payload.sid === share.id
    } catch {
        return false
    }
}

// ─────────────────────────── guest identity (GuestSession) ───────────────────────────

const LAST_SEEN_THROTTLE_MS = 60_000

/**
 * Resolve the guest identity cookie → live GuestSession row (or null = anonymous
 * viewer). Bumps lastSeenAt at most once a minute, fire-and-forget.
 */
export async function getGuestSession(share: ShareLink, cookies: CookieReader): Promise<GuestSession | null> {
    const raw = cookies.get(guestCookieName(share.slug))?.value
    if (!raw || raw.length < 20 || raw.length > 128 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
    const session = await prisma.guestSession.findUnique({ where: { tokenHash: sha256hex(raw) } })
    if (!session || session.shareLinkId !== share.id) return null
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
        prisma.guestSession
            .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
            .catch(() => {}) // cosmetic timestamp — never fail the request over it
    }
    return session
}

/**
 * Create a GuestSession for this share (identity route / first comment). Returns
 * the RAW token exactly once — the caller sets it as the rv_guest cookie; only
 * the sha256 hash is persisted.
 */
export async function createGuestSession(
    share: ShareLink,
    input: { name: string; email: string; userAgent?: string | null },
): Promise<{ session: GuestSession; rawToken: string }> {
    const rawToken = randomBytes(32).toString('base64url')
    const session = await prisma.guestSession.create({
        data: {
            shareLinkId: share.id,
            tokenHash: sha256hex(rawToken),
            name: input.name,
            email: input.email,
            userAgent: input.userAgent ?? null,
        },
    })
    return { session, rawToken }
}

/** Standard attributes for every guest-facing cookie we set. */
export function guestCookieAttrs(maxAgeSec: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
        maxAge: maxAgeSec,
    }
}

// ─────────────────────────── share-scoped playback TTL ───────────────────────────

const SHARE_TOKEN_TTL_SEC = 6 * 60 * 60 // API-SPEC §5.5.3: +6h, capped by share expiry

/** Mux/R2 token TTL for a guest: min(6h, time to share expiry), floor 60s. */
export function shareTokenTtlSec(share: ShareLink): number {
    if (!share.expiresAt) return SHARE_TOKEN_TTL_SEC
    const untilExpiry = Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)
    return Math.max(60, Math.min(SHARE_TOKEN_TTL_SEC, untilExpiry))
}
