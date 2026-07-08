// [review-fixes P4/FR-11] T2/T3/T4 — guest notification emails (EN). All carry the unsubscribe
// footer (PECR/CAN-SPAM); the caller passes the recipient's own unsubscribeUrl. Content is
// deliberately generic — never leaks internal statuses, editor identity, comment bodies, or money.

import { wrapGuestEmail } from './wrap'

function esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

interface Base {
    projectName?: string | null
    reviewUrl: string
    unsubscribeUrl: string
}

/** T2 — VERSION_SENT: a new cut was sent to the client for review. */
export function renderNewVersionEmail(input: Base): { subject: string; html: string } {
    const p = input.projectName ? `“${esc(input.projectName)}”` : 'your project'
    return {
        subject: `A new video is ready for your review`,
        html: wrapGuestEmail({
            title: 'New video ready to review',
            bodyHtml: `<p style="margin:0 0 8px;">A new version of ${p} is ready for you to watch and review.</p>`,
            ctaLabel: 'Open the review',
            ctaUrl: input.reviewUrl,
            unsubscribeUrl: input.unsubscribeUrl,
        }),
    }
}

/** T3 — COMMENT_REPLY: the team replied to the guest's comment (immediate; digest deferred). */
export function renderCommentReplyEmail(input: Base): { subject: string; html: string } {
    const p = input.projectName ? ` on “${esc(input.projectName)}”` : ''
    return {
        subject: `The team replied to your comment`,
        html: wrapGuestEmail({
            title: 'New reply on your review',
            bodyHtml: `<p style="margin:0 0 8px;">The team replied to your comment${p}. Open the review to read it and continue the conversation.</p>`,
            ctaLabel: 'View the reply',
            ctaUrl: input.reviewUrl,
            unsubscribeUrl: input.unsubscribeUrl,
        }),
    }
}

/** [L-EMAIL-2] T5 — the client requested changes → acknowledge it. */
export function renderFeedbackReceivedEmail(input: Base): { subject: string; html: string } {
    const p = input.projectName ? `“${esc(input.projectName)}”` : 'your project'
    return {
        subject: `We’ve received your feedback`,
        html: wrapGuestEmail({
            title: 'Thanks — your feedback is in',
            bodyHtml: `<p style="margin:0 0 8px;">We’ve received your requested changes on ${p}. Our team is working on them and we’ll email you as soon as a revised cut is ready to review.</p>`,
            ctaLabel: 'Open the review',
            ctaUrl: input.reviewUrl,
            unsubscribeUrl: input.unsubscribeUrl,
        }),
    }
}

/** [L-EMAIL-2] T6 — the client approved the cut → thank + set expectations. */
export function renderApprovedEmail(input: Base): { subject: string; html: string } {
    const p = input.projectName ? `“${esc(input.projectName)}”` : 'your project'
    return {
        subject: `Thanks for approving your video`,
        html: wrapGuestEmail({
            title: 'Approved — thank you',
            bodyHtml: `<p style="margin:0 0 8px;">Thank you for approving ${p}. We’ll take it from here and follow up with the final files.</p>`,
            ctaLabel: 'Open the review',
            ctaUrl: input.reviewUrl,
            unsubscribeUrl: input.unsubscribeUrl,
        }),
    }
}

/** T4 — STATUS_UPDATE: a client-visible status changed (EN label only; internalOnly never here). */
export function renderStatusUpdateEmail(input: Base & { statusLabel: string }): { subject: string; html: string } {
    const p = input.projectName ? `“${esc(input.projectName)}”` : 'Your project'
    return {
        subject: `Update: ${esc(input.statusLabel)}`,
        html: wrapGuestEmail({
            title: 'Review status update',
            bodyHtml: `<p style="margin:0 0 8px;">${p} is now <strong>${esc(input.statusLabel)}</strong>.</p>`,
            ctaLabel: 'Open the review',
            ctaUrl: input.reviewUrl,
            unsubscribeUrl: input.unsubscribeUrl,
        }),
    }
}
