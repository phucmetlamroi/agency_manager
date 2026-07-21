// [review-fixes P4/FR-11] Fan out ONE guest-facing email per asset event. Two audiences:
//   (1) the /r/ bell subscribers (GuestSubscription, keyed per asset), and
//   (2) [Phase C] the client's PORTAL notify email(s) — verified in the /share Settings page,
//       keyed by the asset's client (ReviewAsset.clientId, denormalized → ClientShareLink.notifyEmail).
// Direct Resend (NOT the staff registry). Each recipient gets THEIR own unsubscribe token +
// RFC 8058 List-Unsubscribe / One-Click headers. The CALLER (event) owns the hard content filter
// (never fire for internal comments / internalOnly statuses / unapproved versions) + idempotency.
// Never throws.

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { reviewLog } from './logger'
import { guestAppBaseUrl } from './guest-emails/wrap'
import { findClientReviewSlugs } from './shares'
import { renderNewVersionEmail, renderCommentReplyEmail, renderStatusUpdateEmail, renderFeedbackReceivedEmail, renderApprovedEmail } from './guest-emails/notices'

export type GuestEmailEvent = 'version_sent' | 'comment_reply' | 'status_update' | 'feedback_received' | 'approved'

interface Common { projectName: string | null; reviewUrl: string; unsubscribeUrl: string }
function renderForEvent(event: GuestEmailEvent, common: Common, statusLabel?: string): { subject: string; html: string } {
    return event === 'version_sent'
        ? renderNewVersionEmail(common)
        : event === 'comment_reply'
          ? renderCommentReplyEmail(common)
          : event === 'feedback_received'
            ? renderFeedbackReceivedEmail(common)
            : event === 'approved'
              ? renderApprovedEmail(common)
              : renderStatusUpdateEmail({ ...common, statusLabel: statusLabel ?? 'Updated' })
}

/**
 * [Phase C — fan-out fix] Which verified portal notify emails should receive an event about an
 * asset whose client is `assetClientId`? A ClientShareLink's notify email covers not just its own
 * clientId but its WHOLE name-path subtree — every per-workspace DUPLICATE row of the same logical
 * client AND its SUB-BRANDS — exactly the scope resolveShareToken grants a token. Matching the
 * asset's clientId by literal equality misses sub-brand tasks and duplicate-row tasks (the link
 * routinely points at a different, often-empty row than the one holding the deliverable). This
 * mirrors the name-path membership in share-link-auth.ts::resolveShareToken (the source of truth);
 * keep the two in sync. Pure (no DB) so it is unit-testable.
 *
 * A link L covers the asset iff segPath(asset) STARTS WITH segPath(L.seed): the asset's client is
 * the seed itself, a duplicate row of it (equal path), or a sub-brand under it (prefix). Same
 * profile only — distinct name-paths never match, so no cross-client / cross-tenant delivery.
 */
export function selectPortalNotifyLinks(
    assetClientId: number,
    profileClients: { id: number; name: string | null; parentId: number | null }[],
    links: {
        clientId: number
        notifyEmail: string | null
        notifyEmailUnsubToken: string | null
        client?: { status: string; mergedIntoId: number | null } | null
    }[],
): { notifyEmail: string | null; notifyEmailUnsubToken: string | null }[] {
    const byId = new Map(profileClients.map((c) => [c.id, c]))
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
    const startsWith = (full: string[], prefix: string[]): boolean => {
        if (prefix.length === 0 || full.length < prefix.length) return false
        for (let i = 0; i < prefix.length; i++) if (full[i] !== prefix[i]) return false
        return true
    }
    const assetSegs = segPath(assetClientId)
    if (assetSegs.length === 0 || assetSegs.some((s) => s.length === 0)) return []
    const out: { notifyEmail: string | null; notifyEmailUnsubToken: string | null }[] = []
    for (const l of links) {
        // A link minted against a MERGED duplicate resolves to its survivor (matches resolveShareToken).
        const seed = l.client && l.client.status === 'MERGED' && l.client.mergedIntoId ? l.client.mergedIntoId : l.clientId
        if (startsWith(assetSegs, segPath(seed))) out.push({ notifyEmail: l.notifyEmail, notifyEmailUnsubToken: l.notifyEmailUnsubToken })
    }
    return out
}

/**
 * @param statusLabel required for 'status_update' — the CLIENT-FACING EN label (never a raw
 *   internal status; the caller resolves it via portal-derive clientLabelOf + the internalOnly gate).
 */
export async function notifyGuestsOfAsset(input: {
    assetId: string
    event: GuestEmailEvent
    statusLabel?: string
}): Promise<{ sent: number }> {
    try {
        const base = guestAppBaseUrl()
        const asset = await prisma.reviewAsset.findUnique({
            where: { id: input.assetId },
            select: { name: true, clientId: true }, // clientId denormalized from the task on the asset
        })
        // A share slug for this asset → the /r/ review URL for recipients who have no /r/
        // subscription of their own (the portal-only client who verified their email in
        // /share Settings). This is the ONLY link in that email, so it has to be one they can
        // actually open.
        //
        // It used to be "newest non-revoked share containing this asset", with no filter on
        // passwordHash, expiresAt, or shape. Any staff link created after the client's board won
        // the `orderBy: createdAt desc` — an internal password-protected review link, or one with a
        // short expiry — and the client clicking "Your video is ready" landed on PasswordGate (a
        // password nobody gave them) or the expired screen. Nothing else in the email to try.
        //
        // findClientReviewSlugs applies exactly the right filter and is already the portal's own
        // definition of a client board: live, unexpired, no password, downloadable, ungated, and
        // holding this asset ALONE (so the mail can never surface another client's video).
        const clientSlugs = await findClientReviewSlugs([input.assetId])
        let liveSlug = clientSlugs.get(input.assetId) ?? null
        if (!liveSlug) {
            // No client-shaped board — fall back to any link the recipient could still open, and
            // never to one gated by a password or already expired.
            //
            // CONTAINMENT is mandatory here, not optional. This branch runs precisely when no
            // single-asset client board exists, which makes it the branch most likely to land on a
            // staff MULTI-SELECT share — and a /r/ board renders EVERY item it holds to whoever
            // opens the link. Without the check below, an event on client B's asset would email B a
            // link that shows client A's video, and (if the share allows downloads) presign A's
            // master for B. The claim two comments up that the mail "can never surface another
            // client's video" is only true while this holds. Both sibling lookups in shares.ts do
            // the same check; this one shipped without it.
            const openShares = await prisma.shareLink.findMany({
                where: {
                    revokedAt: null,
                    passwordHash: null,
                    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
                    items: { some: { assetId: input.assetId } },
                },
                orderBy: { createdAt: 'desc' },
                take: 50,
                select: { slug: true, items: { select: { assetId: true, folderId: true } } },
            })
            // SINGLE-ASSET containment. This was briefly relaxed to "every sibling belongs to the
            // same client", to let a legitimate REEL board (several of this client's videos on one
            // link) qualify instead of degrading to the landing page. That relaxation was WRONG and
            // is deliberately not coming back: same-client says nothing about whether a sibling was
            // ever DELIVERED. Staff routinely multi-select one delivered cut plus two internal
            // rough cuts of the same client and hit Share; the /r/ board renders every item it
            // holds, with no client-phase gate anywhere downstream (share-guest.ts), so the email
            // would have walked the client straight into un-approved internal work. That is the R5
            // invariant — "an unapproved internal cut must never reach the client" (task-sync.ts) —
            // and it outranks a cosmetic CTA on the reel path.
            //
            // Cost, stated plainly: a client whose only board is a multi-asset reel gets an email
            // whose CTA falls back to `base`. That is logged below. The right repair is to give
            // that asset a client board (the F10 bridge, or a mint here mirroring
            // getOrCreateClientReviewSlug) — NOT to widen what this lookup will accept.
            const contained = openShares.find(
                (s) => s.items.length === 1 && s.items[0].assetId === input.assetId && !s.items[0].folderId,
            )
            liveSlug = contained?.slug ?? null
        }
        if (!liveSlug) {
            // Both lookups missed. The CTA falls back to `base` — the marketing landing page, which
            // tells the recipient nothing. Log it so a client reporting "the link goes nowhere" is
            // diagnosable instead of a mystery.
            reviewLog('warn', 'guest.notify_no_usable_link', { assetId: input.assetId, event: input.event })
        }

        let sent = 0
        const alreadyEmailed = new Set<string>()

        // ── (1) /r/ bell subscribers (GuestSubscription, per asset) ─────────────────────────
        const subs = await prisma.guestSubscription.findMany({
            where: { assetId: input.assetId, unsubscribedAt: null },
            select: { email: true, shareLinkId: true, unsubscribeToken: true },
        })
        if (subs.length) {
            const shareIds = [...new Set(subs.map((s) => s.shareLinkId))]
            const shares = await prisma.shareLink.findMany({
                where: { id: { in: shareIds }, revokedAt: null },
                select: { id: true, slug: true },
            })
            const slugById = new Map(shares.map((s) => [s.id, s.slug]))
            for (const sub of subs) {
                const slug = slugById.get(sub.shareLinkId)
                if (!slug) continue // share revoked/gone → no working URL to send
                const unsubscribeUrl = `${base}/r/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`
                const headers = {
                    'List-Unsubscribe': `<${base}/api/r/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                }
                const rendered = renderForEvent(input.event, { projectName: asset?.name ?? null, reviewUrl: `${base}/r/${slug}`, unsubscribeUrl }, input.statusLabel)
                void sendEmail({ to: sub.email, ...rendered, headers }).catch((e) =>
                    reviewLog('error', 'guest.notify_send_failed', { assetId: input.assetId, error: String(e) }),
                )
                alreadyEmailed.add(sub.email.toLowerCase())
                sent++
            }
        }

        // ── (2) [Phase C] Client PORTAL notify email(s) — verified in /share Settings ───────
        // asset.clientId is the STRINGIFIED Int of Task.clientId. The verified email lives on ONE
        // ClientShareLink (the link's SEED clientId), but its name-path scope covers the asset's
        // client (sub-brand or per-workspace duplicate row) — so we resolve recipients by the same
        // name-path scope resolveShareToken grants, NOT literal clientId equality (which silently
        // misses sub-brand + duplicate-row tasks). Non-numeric (slug-keyed free upload) → skip.
        const assetClientId = asset?.clientId != null ? Number.parseInt(asset.clientId, 10) : NaN
        if (Number.isFinite(assetClientId)) {
            const assetClient = await prisma.client.findUnique({
                where: { id: assetClientId },
                select: { profileId: true, status: true, mergedIntoId: true },
            })
            const profileId = assetClient?.profileId ?? null
            // Follow a MERGED asset-client to its survivor so its name-path resolves against an ACTIVE row.
            const effectiveAssetClientId = assetClient && assetClient.status === 'MERGED' && assetClient.mergedIntoId
                ? assetClient.mergedIntoId
                : assetClientId
            const [profileClients, verifiedLinks] = profileId == null
                ? [[], []]
                : await Promise.all([
                    prisma.client.findMany({ where: { profileId, status: 'ACTIVE' }, select: { id: true, name: true, parentId: true } }),
                    prisma.clientShareLink.findMany({
                        where: { profileId, revokedAt: null, notifyEmailVerifiedAt: { not: null }, notifyEmail: { not: null } },
                        select: { clientId: true, notifyEmail: true, notifyEmailUnsubToken: true, client: { select: { status: true, mergedIntoId: true } } },
                    }),
                ])
            const portalLinks = selectPortalNotifyLinks(effectiveAssetClientId, profileClients, verifiedLinks)
            const reviewUrl = liveSlug ? `${base}/r/${liveSlug}` : base
            for (const pl of portalLinks) {
                const email = (pl.notifyEmail ?? '').toLowerCase()
                if (!email || alreadyEmailed.has(email)) continue // dedupe with the /r/ subscribers
                alreadyEmailed.add(email)
                // Footer link → a PAGE (GET never mutates); List-Unsubscribe header → one-click POST.
                const unsubscribeUrl = pl.notifyEmailUnsubToken
                    ? `${base}/portal-notify/unsubscribe?token=${encodeURIComponent(pl.notifyEmailUnsubToken)}`
                    : base
                const headers = pl.notifyEmailUnsubToken
                    ? {
                        'List-Unsubscribe': `<${base}/api/portal-notify/unsubscribe?token=${encodeURIComponent(pl.notifyEmailUnsubToken)}>`,
                        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                    }
                    : undefined
                const rendered = renderForEvent(input.event, { projectName: asset?.name ?? null, reviewUrl, unsubscribeUrl }, input.statusLabel)
                void sendEmail({ to: pl.notifyEmail!, ...rendered, headers }).catch((e) =>
                    reviewLog('error', 'guest.portal_notify_send_failed', { assetId: input.assetId, error: String(e) }),
                )
                sent++
            }
        }

        return { sent }
    } catch (e) {
        reviewLog('error', 'guest.notify_failed', { assetId: input.assetId, event: input.event, error: String(e) })
        return { sent: 0 }
    }
}
