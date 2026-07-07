// [review-fixes P4/FR-11] Shared HTML shell for guest (client-facing) emails — EN only,
// sent DIRECT via Resend (NOT the staff notification-emails registry / NotificationPreference).
// Inline styles only (email clients strip <style>). T1 (verify-pin) is transactional and omits
// the unsubscribe footer; T2/T3/T4 MUST pass unsubscribeUrl (CAN-SPAM / UK PECR).

const BRAND = 'HustlyTasker'

export interface GuestEmailInput {
    title: string
    /** Pre-escaped inner HTML (callers build their own <p>…</p>). */
    bodyHtml: string
    ctaLabel?: string
    ctaUrl?: string
    /** When set, renders the unsubscribe footer (required for all but the PIN email). */
    unsubscribeUrl?: string | null
}

/** Minimal, robust, dark-on-light card. Returns a full HTML document string. */
export function wrapGuestEmail(input: GuestEmailInput): string {
    const cta =
        input.ctaLabel && input.ctaUrl
            ? `<tr><td style="padding:8px 0 4px;">
                 <a href="${input.ctaUrl}" style="display:inline-block;background:#111827;color:#ffffff;
                    text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px;">
                    ${input.ctaLabel}</a></td></tr>`
            : ''
    const unsub = input.unsubscribeUrl
        ? `<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;">
             You're receiving this because you subscribed to updates for this review.
             <a href="${input.unsubscribeUrl}" style="color:#6b7280;">Unsubscribe</a>.</p>`
        : ''
    return `<!doctype html><html><body style="margin:0;background:#f3f4f6;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
        <tr><td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px 28px 24px;
                        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
                        border:1px solid #e5e7eb;">
            <tr><td style="font-size:13px;font-weight:700;letter-spacing:.4px;color:#6b7280;text-transform:uppercase;padding-bottom:10px;">${BRAND}</td></tr>
            <tr><td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:12px;">${input.title}</td></tr>
            <tr><td style="font-size:15px;line-height:1.6;color:#374151;">${input.bodyHtml}</td></tr>
            ${cta}
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr><td style="padding:0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${unsub}</td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`
}

/** Public base URL for building /r/{slug} links inside guest emails. */
export function guestAppBaseUrl(): string {
    return (process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz').replace(/\/$/, '')
}
