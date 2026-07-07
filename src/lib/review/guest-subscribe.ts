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
import { reviewLog } from './logger'

const PIN_TTL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_ATTEMPTS = 5

export type ShareWithItems = ShareLink & { items: { assetId: string | null }[] }

export type RequestPinStatus = 'pin_sent' | 'already_subscribed' | 'already_verified'

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
 * request-pin: issue a fresh code (or skip if the email is already verified / already subscribed).
 * The CALLER (route) owns rate-limiting + the neutral-200 envelope. `email` is the guest's own —
 * from their session, else typed into the form. Returns the status the guest's UI should reflect.
 */
export async function requestGuestPin(input: {
    share: ShareWithItems
    assetId: string
    email: string
    guestSessionId: string | null
    ip: string | null
}): Promise<RequestPinStatus> {
    const email = normEmail(input.email)
    // Out-of-scope asset → behave EXACTLY like a sent PIN (anti-enumeration) without doing anything.
    if (!assetInShare(input.share, input.assetId)) return 'pin_sent'

    // Already subscribed to THIS asset → nothing to do.
    const existing = await prisma.guestSubscription.findUnique({
        where: { email_assetId: { email, assetId: input.assetId } },
        select: { unsubscribedAt: true },
    })
    if (existing && !existing.unsubscribedAt) return 'already_subscribed'

    // Verified elsewhere (double-opt-in already proven) → subscribe straight to the new asset.
    if (await emailAlreadyVerified(email)) {
        await ensureSubscription({
            email,
            assetId: input.assetId,
            shareLinkId: input.share.id,
            guestSessionId: input.guestSessionId,
            ip: input.ip,
        })
        return 'already_verified'
    }

    // Fresh code.
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
    return 'pin_sent'
}

export type VerifyPinResult =
    | { ok: true }
    | { ok: false; reason: 'invalid' | 'expired' | 'locked' | 'no_pin' }

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

    // Correct: consume the code, create/reactivate the subscription, stamp the session verified.
    await prisma.$transaction(async (tx) => {
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
        if (input.guest && !input.guest.emailVerifiedAt) {
            await tx.guestSession.update({ where: { id: input.guest.id }, data: { emailVerifiedAt: new Date() } })
        }
    })
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
