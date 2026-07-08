// [review-fixes P4/FR-11] Fan out ONE guest-facing email to every live subscriber of an asset.
// Direct Resend (NOT the staff registry). Each recipient gets THEIR own unsubscribe token +
// RFC 8058 List-Unsubscribe / One-Click headers. The CALLER (event) owns the hard content filter
// (never fire for internal comments / internalOnly statuses / unapproved versions) + idempotency;
// this layer only fans out to (assetId, unsubscribedAt=null) subscriptions. Never throws.

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { reviewLog } from './logger'
import { guestAppBaseUrl } from './guest-emails/wrap'
import { renderNewVersionEmail, renderCommentReplyEmail, renderStatusUpdateEmail, renderFeedbackReceivedEmail, renderApprovedEmail } from './guest-emails/notices'

export type GuestEmailEvent = 'version_sent' | 'comment_reply' | 'status_update' | 'feedback_received' | 'approved'

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
        const subs = await prisma.guestSubscription.findMany({
            where: { assetId: input.assetId, unsubscribedAt: null },
            select: { email: true, shareLinkId: true, unsubscribeToken: true },
        })
        if (!subs.length) return { sent: 0 }

        const asset = await prisma.reviewAsset.findUnique({ where: { id: input.assetId }, select: { name: true } })
        // Resolve the newest slug per share (skip revoked/missing — the link wouldn't open).
        const shareIds = [...new Set(subs.map((s) => s.shareLinkId))]
        const shares = await prisma.shareLink.findMany({
            where: { id: { in: shareIds }, revokedAt: null },
            select: { id: true, slug: true },
        })
        const slugById = new Map(shares.map((s) => [s.id, s.slug]))
        const base = guestAppBaseUrl()

        let sent = 0
        for (const sub of subs) {
            const slug = slugById.get(sub.shareLinkId)
            if (!slug) continue // share revoked/gone → no working URL to send
            const reviewUrl = `${base}/r/${slug}`
            const unsubscribeUrl = `${base}/r/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}`
            const headers = {
                'List-Unsubscribe': `<${base}/api/r/unsubscribe?token=${encodeURIComponent(sub.unsubscribeToken)}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            }
            const common = { projectName: asset?.name ?? null, reviewUrl, unsubscribeUrl }
            const rendered =
                input.event === 'version_sent'
                    ? renderNewVersionEmail(common)
                    : input.event === 'comment_reply'
                      ? renderCommentReplyEmail(common)
                      : input.event === 'feedback_received'
                        ? renderFeedbackReceivedEmail(common)
                        : input.event === 'approved'
                          ? renderApprovedEmail(common)
                          : renderStatusUpdateEmail({ ...common, statusLabel: input.statusLabel ?? 'Updated' })
            void sendEmail({ to: sub.email, ...rendered, headers }).catch((e) =>
                reviewLog('error', 'guest.notify_send_failed', { assetId: input.assetId, error: String(e) }),
            )
            sent++
        }
        return { sent }
    } catch (e) {
        reviewLog('error', 'guest.notify_failed', { assetId: input.assetId, event: input.event, error: String(e) })
        return { sent: 0 }
    }
}
