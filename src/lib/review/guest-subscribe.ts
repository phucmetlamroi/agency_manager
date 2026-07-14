// [review-fixes P4/FR-11] Guest email-subscription service (surface A: /r/{slug} review guests).
// Double-opt-in: request-pin → email 6-digit code (otp.ts) → verify-pin → GuestSubscription.
// Subscription is keyed (email, assetId) so it survives share-link (slug) rotation; shareLinkId
// only stores the newest slug for building email deep-links. NO staff NotificationPreference,
// NO GuestSession-keyed subs. Anti-enumeration: request-pin never reveals whether an email/asset
// exists — the ROUTE always answers 200; this layer just returns a status the guest's own UI reads.

import { prisma } from '@/lib/db'
import type { GuestSession, ShareLink } from '@prisma/client'
import { generateOtp, hashOtp, verifyOtp } from '@/lib/otp'
import { sendEmail } from '@/lib/email'
import { renderVerifyPinEmail } from './guest-emails/verify-pin'
import { isSyntheticGuestEmail } from './share-auth'
import { reviewLog } from './logger'

const PIN_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type ShareWithItems = ShareLink & { items: { assetId: string | null }[] }

/** True when `assetId` is actually one of the share's items (scope guard). */
function assetInShare(share: ShareWithItems, assetId: string): boolean {
    return share.items.some((i) => i.assetId === assetId)
}

function normEmail(raw: string): string {
    return raw.trim().toLowerCase()
}

/** Ensure a verified (email, assetId) subscription exists / is reactivated. Idempotent. */
async function ensureSubscription(input: {
    email: string
    assetId: string
    shareLinkId: string
    guestSessionId: string | null
    ip: string | null
}): Promise<void> {
    const now = new Date()
    await prisma.guestSubscription.upsert({
        where: { email_assetId: { email: input.email, assetId: input.assetId } },
        create: {
            email: input.email,
            assetId: input.assetId,
            shareLinkId: input.shareLinkId,
            guestSessionId: input.guestSessionId,
            verifiedAt: now,
            verifyIp: input.ip,
        },
        // Re-subscribe (clear unsubscribedAt) + refresh the newest slug for email URLs.
        update: { shareLinkId: input.shareLinkId, unsubscribedAt: null, guestSessionId: input.guestSessionId },
    })
}

/** Has this email already proven ownership (any live sub anywhere)? → skip the PIN. */
async function emailAlreadyVerified(email: string): Promise<boolean> {
    const live = await prisma.guestSubscription.findFirst({
        where: { email, unsubscribedAt: null, verifiedAt: { not: undefined } },
        select: { id: true },
    })
    return !!live
}

/**
 * request-pin: issue a fresh code, OR — ONLY for the guest's own session email — skip straight to a
 * subscription when ownership is already proven. The route ALWAYS answers a neutral `pin_sent`, so
 * this returns nothing: it must never let its outcome branch the client-visible body (that would be
 * an email/subscription enumeration oracle — see request-pin route). Skip-PIN is gated on
 * `isOwnEmail` because a body-supplied FOREIGN email must earn a fresh PIN it can only clear from its
 * OWN inbox; otherwise any share visitor could force-subscribe / probe an arbitrary address.
 */
export async function requestGuestPin(input: {
    share: ShareWithItems
    assetId: string
    email: string
    /** True ONLY when `email` equals the authenticated guest session's own email. */
    isOwnEmail: boolean
    guestSessionId: string | null
    ip: string | null
    /** [AUDIT H2] Sign-off flow: ALWAYS mint a fresh code (never take the own-email auto-subscribe
     *  shortcut) so verify-pin actually runs and stamps emailVerifiedAt on THIS session — the only
     *  signal the decision gate trusts. Without this a returning-but-already-verified client would be
     *  auto-subscribed with no code sent, and could never satisfy the (fallback-free) sign-off gate. */
    alwaysSendCode?: boolean
}): Promise<void> {
    const email = normEmail(input.email)
    // Out-of-scope asset → do nothing (the route still answers a neutral pin_sent).
    if (!assetInShare(input.share, input.assetId)) return

    // Skip-PIN / auto-subscribe is safe ONLY for the guest's own session email — and never for a
    // sign-off, which must earn a fresh code from the actual inbox.
    if (!input.alwaysSendCode && input.isOwnEmail) {
        // Already subscribed to THIS asset → nothing to do.
        const existing = await prisma.guestSubscription.findUnique({
            where: { email_assetId: { email, assetId: input.assetId } },
            select: { unsubscribedAt: true },
        })
        if (existing && !existing.unsubscribedAt) return

        // Verified elsewhere (ownership already proven) → subscribe straight to this asset.
        if (await emailAlreadyVerified(email)) {
            await ensureSubscription({
                email,
                assetId: input.assetId,
                shareLinkId: input.share.id,
                guestSessionId: input.guestSessionId,
                ip: input.ip,
            })
            return
        }
    }

    // Fresh code — foreign email, or the guest's own-but-unverified email.
    const pin = generateOtp()
    await prisma.guestEmailVerification.create({
        data: {
            email,
            codeHash: hashOtp(pin),
            shareLinkId: input.share.id,
            expiresAt: new Date(Date.now() + PIN_TTL_MS),
            requestIp: input.ip,
        },
    })
    const asset = await prisma.reviewAsset.findUnique({ where: { id: input.assetId }, select: { name: true } })
    // Fire-and-forget: a Resend hiccup must not turn into a status oracle for the guest.
    void sendEmail({ to: email, ...renderVerifyPinEmail({ pin, projectName: asset?.name ?? null }) }).catch((e) =>
        reviewLog('error', 'guest.pin_email_failed', { assetId: input.assetId, error: String(e) }),
    )
}

export type VerifyPinResult =
    | { ok: true }
    | { ok: false; reason: 'invalid' | 'expired' | 'locked' | 'no_pin' | 'reviewer_limit' }

/** [Owner decision 2026-07-15] One reviewer email per share link. This bounds the notification
 *  double-opt-in (request-pin → verify-pin): only the FIRST email to verify on a link can subscribe;
 *  a different email hits `reviewer_limit`. Approval itself no longer uses a PIN (share-decision.ts). */
export const MAX_REVIEWERS_PER_SHARE = 1

/**
 * verify-pin: check the newest live code for (email, share), then create the subscription.
 * Unlike request-pin this MAY answer non-neutrally — the guest is actively entering THEIR code.
 */
export async function verifyGuestPin(input: {
    share: ShareWithItems
    guest: GuestSession | null
    assetId: string
    email: string
    pin: string
    ip: string | null
}): Promise<VerifyPinResult> {
    const email = normEmail(input.email)
    if (!assetInShare(input.share, input.assetId)) return { ok: false, reason: 'invalid' }

    const row = await prisma.guestEmailVerification.findFirst({
        where: { email, shareLinkId: input.share.id, consumedAt: null },
        orderBy: { createdAt: 'desc' },
    })
    if (!row) return { ok: false, reason: 'no_pin' }
    if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: 'locked' }
    if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }

    if (!verifyOtp(input.pin, row.codeHash)) {
        const bumped = await prisma.guestEmailVerification.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
            select: { attempts: true },
        })
        return { ok: false, reason: bumped.attempts >= MAX_ATTEMPTS ? 'locked' : 'invalid' }
    }

    // [AUDIT H2 — verified-email binding] The correct PIN proves control of `email`. We may ONLY
    // stamp GuestSession.emailVerifiedAt when `email` is this session's OWN email — otherwise an
    // attacker could self-declare a victim's email on the session, verify their OWN inbox with a
    // foreign email, and have the (victim-emailed) session treated as proven. A foreign-email verify
    // still creates/refreshes the subscription (updates notifications), it just never marks the
    // session verified.
    const stampsSession = !!input.guest && !input.guest.emailVerifiedAt && normEmail(input.guest.email) === email

    // Correct: consume the code, refresh the subscription, and (own-email only) stamp the session
    // verified — all in ONE transaction. When this would add a NEW verified reviewer, first take a
    // per-share advisory lock and RE-COUNT distinct verified reviewer emails INSIDE the tx: a pre-tx
    // count is a TOCTOU hole (two concurrent 4th-verifies could both read < 3 and both stamp, exceeding
    // MAX_REVIEWERS_PER_SHARE). Synthetic known-client identities (@review.invalid) are excluded — they
    // are never real reviewers and must not consume a slot nor block a real 3rd reviewer.
    try {
        const outcome = await prisma.$transaction(async (tx) => {
            if (stampsSession && input.guest) {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.share.id}, 0))`
                const verified = await tx.guestSession.findMany({
                    where: { shareLinkId: input.share.id, emailVerifiedAt: { not: null } },
                    select: { email: true },
                })
                const distinct = new Set(
                    verified.map((v) => normEmail(v.email)).filter((e) => !isSyntheticGuestEmail(e)),
                )
                if (!distinct.has(email) && distinct.size >= MAX_REVIEWERS_PER_SHARE) {
                    return 'reviewer_limit' as const
                }
            }
            await tx.guestEmailVerification.update({ where: { id: row.id }, data: { consumedAt: new Date() } })
            await tx.guestSubscription.upsert({
                where: { email_assetId: { email, assetId: input.assetId } },
                create: {
                    email,
                    assetId: input.assetId,
                    shareLinkId: input.share.id,
                    guestSessionId: input.guest?.id ?? null,
                    verifiedAt: new Date(),
                    verifyIp: input.ip,
                },
                update: { shareLinkId: input.share.id, unsubscribedAt: null, guestSessionId: input.guest?.id ?? null },
            })
            if (stampsSession && input.guest) {
                await tx.guestSession.update({ where: { id: input.guest.id }, data: { emailVerifiedAt: new Date() } })
            }
            return 'ok' as const
        })
        if (outcome === 'reviewer_limit') return { ok: false, reason: 'reviewer_limit' }
    } catch (e) {
        // Prisma upsert isn't atomic: a concurrent double-submit of the same valid PIN can both take
        // the create branch, so the loser hits P2002 (unique email_assetId). The winner already
        // subscribed the guest, so treat the duplicate as an idempotent success rather than a 500.
        if (e && typeof e === 'object' && 'code' in e && (e as { code?: unknown }).code === 'P2002') {
            return { ok: true }
        }
        throw e
    }
    return { ok: true }
}

/** Current guest's subscription state for one asset (drives the gear/banner UI). */
export async function guestSubscriptionStatus(input: {
    guest: GuestSession | null
    assetId: string
}): Promise<{ subscribed: boolean; email: string | null }> {
    if (!input.guest) return { subscribed: false, email: null }
    const sub = await prisma.guestSubscription.findUnique({
        where: { email_assetId: { email: normEmail(input.guest.email), assetId: input.assetId } },
        select: { unsubscribedAt: true },
    })
    return { subscribed: !!sub && !sub.unsubscribedAt, email: input.guest.email }
}

/** One-click unsubscribe by opaque token. Idempotent; never reveals whether the token existed. */
export async function unsubscribeGuestByToken(token: string): Promise<void> {
    if (!token || token.length < 8 || token.length > 64) return
    await prisma.guestSubscription
        .updateMany({ where: { unsubscribeToken: token, unsubscribedAt: null }, data: { unsubscribedAt: new Date() } })
        .catch((e) => reviewLog('error', 'guest.unsubscribe_failed', { error: String(e) }))
}
