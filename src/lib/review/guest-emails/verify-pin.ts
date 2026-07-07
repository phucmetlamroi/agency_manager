// [review-fixes P4/FR-11] T1 — guest email verification PIN. Transactional (double-opt-in
// consent proof), so NO unsubscribe footer. Never leaks the asset's internal name/status.

import { wrapGuestEmail } from './wrap'

export function renderVerifyPinEmail(input: { pin: string; projectName?: string | null }): {
    subject: string
    html: string
} {
    const scope = input.projectName ? ` for “${escapeHtml(input.projectName)}”` : ''
    const body = `
      <p style="margin:0 0 14px;">Enter this code to turn on email updates${scope}:</p>
      <p style="margin:0 0 14px;font-size:34px;font-weight:800;letter-spacing:10px;color:#111827;
                background:#f3f4f6;border-radius:12px;padding:16px 0;text-align:center;">${input.pin}</p>
      <p style="margin:0;font-size:13px;color:#6b7280;">This code expires in 10 minutes. If you didn't request it, you can ignore this email — nothing changes.</p>`
    return {
        subject: `${input.pin} is your review updates code`,
        html: wrapGuestEmail({ title: 'Confirm your email', bodyHtml: body }),
    }
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
