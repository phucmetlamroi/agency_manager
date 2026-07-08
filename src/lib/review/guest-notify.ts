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
        // A live share slug for this asset → the /r/ review URL (works even with no /r/ subscriber,
        // e.g. a portal-only recipient).
        const liveShare = await prisma.shareLink.findFirst({
            where: { revokedAt: null, items: { some: { assetId: input.assetId } } },
            orderBy: { createdAt: 'desc' },
            select: { slug: true },
        })

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
        // asset.clientId is the STRINGIFIED Int of Task.clientId (upload-service); parse it
        // back to match ClientShareLink.clientId (Int). Non-numeric (slug-keyed free upload) → skip.
        const clientId = asset?.clientId != null ? Number.parseInt(asset.clientId, 10) : NaN
        if (Number.isFinite(clientId)) {
            const portalLinks = await prisma.clientShareLink.findMany({
                where: { clientId, revokedAt: null, notifyEmailVerifiedAt: { not: null }, notifyEmail: { not: null } },
                select: { notifyEmail: true, notifyEmailUnsubToken: true },
            })
            const reviewUrl = liveShare?.slug ? `${base}/r/${liveShare.slug}` : base
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
