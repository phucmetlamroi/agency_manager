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

/**
 * [AUDIT H2] Domain of the synthetic, non-routable address minted for the known-client
 * auto-identity (createLinkClientGuestSession). A GuestSession on such an address has NOT proven
 * control of a real inbox, so it must NEVER be treated as email-verified for a client SIGN-OFF
 * decision — otherwise merely holding the slug lets a stranger approve UNDER the client's name.
 */
export const SYNTHETIC_CLIENT_EMAIL_DOMAIN = 'review.invalid'
export function isSyntheticGuestEmail(email: string | null | undefined): boolean {
    return !!email && email.toLowerCase().endsWith(`@${SYNTHETIC_CLIENT_EMAIL_DOMAIN}`)
}

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

/** A short fingerprint of the CURRENT password hash. Embedded in the unlock JWT so
 *  that rotating (or removing) the password invalidates every outstanding unlock
 *  cookie — otherwise a guest who entered a since-leaked password would keep access
 *  for the full 24h TTL despite the staff changing it. */
const passwordFingerprint = (passwordHash: string) => sha256hex(passwordHash).slice(0, 16)

/** Mint the unlock JWT after a correct password (unlock route). */
export async function mintUnlockToken(share: ShareLink): Promise<{ value: string; maxAgeSec: number }> {
    const now = Math.floor(Date.now() / 1000)
    let ttl = UNLOCK_TTL_SEC
    if (share.expiresAt) {
        ttl = Math.min(ttl, Math.max(60, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000)))
    }
    const value = await new SignJWT({ sid: share.id, pv: share.passwordHash ? passwordFingerprint(share.passwordHash) : '' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(now)
        .setExpirationTime(now + ttl)
        .sign(cookieSecret())
    return { value, maxAgeSec: ttl }
}

async function verifyUnlockCookie(share: ShareLink, cookieValue: string | undefined): Promise<boolean> {
    if (!cookieValue || !share.passwordHash) return false
    try {
        const { payload } = await jwtVerify(cookieValue, cookieSecret(), { algorithms: ['HS256'] })
        // Bind to the CURRENT password — a rotated password changes the fingerprint and
        // invalidates the cookie (guest is re-prompted).
        return payload.sid === share.id && payload.pv === passwordFingerprint(share.passwordHash)
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

// ─────────────────────────── [P5] known-client auto-identity ───────────────────────────

/**
 * Resolve the CLIENT a share is FOR. A share created from a task (`share.taskId`) belongs
 * to that task's client, so the link IS that client's link. Returns null for Team-level
 * shares (no task) or when the client is absent / not ACTIVE — those keep the guest
 * Name+Email modal (truly external recipients).
 */
export async function resolveShareClient(share: ShareLink): Promise<{ id: number; name: string } | null> {
    if (!share.taskId) return null
    const task = await prisma.task.findUnique({
        where: { id: share.taskId },
        select: { client: { select: { id: true, name: true, status: true, parentId: true } } },
    })
    type ClientNode = { id: number; name: string; status: string; parentId: number | null }
    const c0 = task?.client
    if (!c0 || c0.status !== 'ACTIVE') return null
    // Walk up to the MAIN client: comments must show the top-level client name (e.g.
    // "Jack"), NOT the sub-client / brand the task is filed under (e.g. "MotoHalo").
    // Bounded loop guards against a cycle in malformed parent chains; stop at the last
    // ACTIVE ancestor if a parent is archived/merged.
    let current: ClientNode = c0
    let guard = 0
    while (current.parentId != null && guard++ < 10) {
        const parent: ClientNode | null = await prisma.client.findUnique({
            where: { id: current.parentId },
            select: { id: true, name: true, status: true, parentId: true },
        })
        if (!parent || parent.status !== 'ACTIVE') break
        current = parent
    }
    return { id: current.id, name: current.name }
}

/**
 * [Codex review 2026-07] EVERY client id this share could legitimately belong to —
 * for AUTHORIZATION only. `resolveShareClient` above is a DISPLAY helper: it walks UP
 * to the top-level ancestor so comments read "Jack" rather than the sub-brand "MotoHalo".
 * Using that single top-level id as an access check rejects the rightful owner twice:
 *
 *   1. A token issued for the SUB-BRAND has clientIds = [MotoHalo, …descendants] — it
 *      never contains the parent Jack, so comparing against Jack fails and MotoHalo's
 *      own client is told to identify themselves again.
 *   2. Multi-asset / folder shares carry taskId = null by design (shares.ts), so the
 *      display helper returns null immediately and the same false rejection happens.
 *
 * Widening is safe here: these ids are only ever INTERSECTED with the caller's token
 * scope. Returning more candidates can never grant access the token did not already
 * carry — it only stops us denying an owner who is plainly in scope.
 */
export async function resolveShareOwnerClientIds(share: ShareLink): Promise<number[]> {
    const out = new Set<number>()

    const addChain = async (rootId: number | null) => {
        let cur = rootId
        let guard = 0
        while (cur != null && guard++ < 10) {
            if (out.has(cur)) break // already walked this chain
            out.add(cur)
            const c: { parentId: number | null } | null = await prisma.client.findUnique({
                where: { id: cur },
                select: { parentId: true },
            })
            cur = c?.parentId ?? null
        }
    }

    // The task's OWN client (plus ancestors, so a root-level token still matches).
    if (share.taskId) {
        const task = await prisma.task.findUnique({
            where: { id: share.taskId },
            select: { clientId: true },
        })
        await addChain(task?.clientId ?? null)
    }

    // Task-less shares (multi-asset / folder): fall back to the items themselves.
    // An item is EITHER an asset or a folder — cover both, or folder shares keep
    // resolving to nothing and the client is asked to identify themselves again.
    // NOTE: ReviewAsset.taskId is a bare scalar (no Prisma relation), and both
    // clientId columns are denormalized STRINGS, so resolve them in stages.
    const items = await prisma.shareLinkItem.findMany({
        where: { shareLinkId: share.id },
        select: { assetId: true, folderId: true },
    })
    const assetIds = items.map((i) => i.assetId).filter((v): v is string => !!v)
    const folderIds = items.map((i) => i.folderId).filter((v): v is string => !!v)

    const [assets, folders] = await Promise.all([
        assetIds.length
            ? prisma.reviewAsset.findMany({ where: { id: { in: assetIds } }, select: { clientId: true, taskId: true } })
            : Promise.resolve([]),
        folderIds.length
            ? prisma.reviewFolder.findMany({ where: { id: { in: folderIds } }, select: { clientId: true } })
            : Promise.resolve([]),
    ])

    const denormIds = [...assets.map((a) => a.clientId), ...folders.map((f) => f.clientId)]
    for (const raw of denormIds) {
        const n = Number(raw)
        if (raw != null && raw !== '' && Number.isFinite(n)) await addChain(n)
    }

    const taskIds = assets.map((a) => a.taskId).filter((v): v is string => !!v)
    if (taskIds.length) {
        const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { clientId: true } })
        for (const t of tasks) await addChain(t.clientId ?? null)
    }

    return [...out]
}

/**
 * [P5, owner opt-in] For a share tied to a known client, provision a GuestSession
 * identified AS that client — so the agency's own clients never see the Name/Email modal
 * (only external share-link recipients do). The email is a synthetic, non-routable address
 * (`.invalid`, RFC 2606) because Client has no email column, and emailVerifiedAt is set so
 * the FR-11 PIN double-opt-in never emails it. This is SAFE: the guest email is only ever
 * used by that PIN flow — the comment path notifies staff only, never the guest.
 */
export async function createLinkClientGuestSession(
    share: ShareLink,
    opts: { userAgent?: string | null } = {},
): Promise<{ session: GuestSession; rawToken: string } | null> {
    const client = await resolveShareClient(share)
    if (!client) return null
    const rawToken = randomBytes(32).toString('base64url')
    const session = await prisma.guestSession.create({
        data: {
            shareLinkId: share.id,
            tokenHash: sha256hex(rawToken),
            name: client.name,
            email: `noreply+client-${client.id}@${SYNTHETIC_CLIENT_EMAIL_DOMAIN}`,
            emailVerifiedAt: new Date(),
            userAgent: opts.userAgent ?? null,
        },
    })
    return { session, rawToken }
}

/**
 * Resolve the guest session for a WRITE route, in order: (1) the existing rv_guest cookie
 * session, (2) the { name, email } the modal submitted (external guest, first write), or
 * (3) the share's own client (known-client auto-identity, no modal). Throws 401 only when
 * the visitor is truly anonymous AND the link has no client. `rawToken` is non-null when a
 * session was just created — the caller MUST set the rv_guest cookie with it on the response.
 */
export async function resolveGuestForWrite(
    share: ShareWithItems,
    cookies: CookieReader,
    guestInput: { name: string; email: string } | null,
    userAgent: string | null,
    denyMessage = 'Please add your name and email to comment.',
): Promise<{ session: GuestSession; rawToken: string | null }> {
    const existing = await getGuestSession(share, cookies)
    if (existing) return { session: existing, rawToken: null }
    if (guestInput) {
        const created = await createGuestSession(share, {
            name: guestInput.name,
            email: guestInput.email.toLowerCase(),
            userAgent,
        })
        return { session: created.session, rawToken: created.rawToken }
    }
    const linkGuest = await createLinkClientGuestSession(share, { userAgent })
    if (linkGuest) return linkGuest
    throw apiError(401, 'UNAUTHORIZED', denyMessage)
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
