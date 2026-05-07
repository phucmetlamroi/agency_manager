/**
 * HustlyTasker email shell — header + body + footer with unsubscribe.
 * All templates wrap their body content with this for consistent branding.
 *
 * Inline CSS only — email clients (Gmail, Outlook, Apple Mail) strip <style>
 * blocks aggressively, so all styling MUST be inline on each element.
 */

import { buildUnsubscribeUrl } from './unsubscribe'

const BRAND = '#7C3AED' // violet-600
const BRAND_DARK = '#6D28D9' // violet-700
const BG = '#F4F4F4'
const TEXT_PRIMARY = '#111827'
const TEXT_SECONDARY = '#6b7280'
const BORDER = '#e5e7eb'

interface WrapParams {
    bodyHtml: string
    recipientUserId: string
    eventType?: string | null
    appUrl: string
    workspaceId?: string | null
    /** Override footer settings link path. Defaults to dashboard profile. */
    settingsPath?: string
}

export async function wrapTemplate(params: WrapParams): Promise<string> {
    const { bodyHtml, recipientUserId, eventType, appUrl, workspaceId, settingsPath } = params
    const unsubUrl = await buildUnsubscribeUrl(recipientUserId, eventType ?? undefined, appUrl)
    const settingsUrl = settingsPath
        ? `${appUrl}${settingsPath}`
        : workspaceId
            ? `${appUrl}/${workspaceId}/dashboard/profile`
            : `${appUrl}`
    const year = new Date().getFullYear()

    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HustlyTasker</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${TEXT_PRIMARY};line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background:linear-gradient(135deg,${BRAND_DARK},${BRAND});padding:24px 32px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td>
<div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:10px;padding:8px 14px;">
<span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">⚡ HustlyTasker</span>
</div>
</td>
</tr>
</table>
</td>
</tr>

<!-- Body slot -->
<tr>
<td style="padding:32px 32px 24px 32px;">
${bodyHtml}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding:0 32px 28px 32px;">
<div style="border-top:1px solid ${BORDER};padding-top:20px;font-size:12px;color:${TEXT_SECONDARY};line-height:1.5;">
<p style="margin:0 0 10px 0;">Bạn nhận email này vì có thông báo mới trên HustlyTasker.</p>
<p style="margin:0 0 14px 0;">
<a href="${settingsUrl}" style="color:${BRAND};text-decoration:none;font-weight:600;">Cài đặt thông báo</a>
&nbsp;·&nbsp;
<a href="${unsubUrl}" style="color:${TEXT_SECONDARY};text-decoration:underline;">Tắt email thông báo</a>
</p>
<p style="margin:0;color:#9ca3af;font-size:11px;">© ${year} HustlyTasker. All rights reserved.</p>
</div>
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

/* ─────────────────────────────────────────────────────────────────────────
   Reusable body component helpers — used inside template files
   ───────────────────────────────────────────────────────────────────────── */

export const COLORS = {
    BRAND,
    BRAND_DARK,
    BG,
    TEXT_PRIMARY,
    TEXT_SECONDARY,
    BORDER,
    SUCCESS: '#10b981',
    WARNING: '#f59e0b',
    DANGER: '#dc2626',
    INFO: '#2563eb',
}

/** Heading at top of email body — emoji + text, violet color */
export function heading(emoji: string, title: string): string {
    return `<h1 style="margin:0 0 16px 0;font-size:22px;font-weight:800;color:${TEXT_PRIMARY};letter-spacing:-0.01em;">${emoji} ${title}</h1>`
}

/** Subheading line under main heading */
export function subheading(text: string): string {
    return `<p style="margin:0 0 20px 0;color:${TEXT_SECONDARY};font-size:14px;">${text}</p>`
}

/** Card container — used for the main content block (avatar + sender + body) */
export function card(innerHtml: string, accentColor = BRAND): string {
    return `<div style="background:#fafafa;border-left:4px solid ${accentColor};border-radius:8px;padding:18px 20px;margin:0 0 22px 0;">
${innerHtml}
</div>`
}

/** Banner — full-width colored notice (used for deadline warnings) */
export function banner(text: string, level: 'warn' | 'danger' | 'info' = 'warn'): string {
    const colorMap = {
        warn:   { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
        danger: { bg: '#fee2e2', border: '#dc2626', text: '#991b1b' },
        info:   { bg: '#dbeafe', border: '#2563eb', text: '#1e40af' },
    }
    const c = colorMap[level]
    return `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:8px;padding:12px 16px;margin:0 0 18px 0;color:${c.text};font-weight:600;font-size:14px;text-align:center;">${text}</div>`
}

/** Primary CTA button — violet, bold */
export function ctaButton(text: string, url: string, variant: 'primary' | 'secondary' = 'primary'): string {
    const styles = {
        primary: { bg: BRAND, color: '#ffffff', border: BRAND },
        secondary: { bg: '#ffffff', color: BRAND, border: BRAND },
    }
    const s = styles[variant]
    return `<a href="${url}" style="display:inline-block;padding:12px 24px;background:${s.bg};color:${s.color};border:2px solid ${s.border};text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;letter-spacing:0.01em;">${text}</a>`
}

/** Two CTAs side-by-side */
export function ctaRow(buttons: { text: string, url: string, variant?: 'primary' | 'secondary' }[]): string {
    const html = buttons.map(b => ctaButton(b.text, b.url, b.variant ?? 'primary')).join('&nbsp;&nbsp;')
    return `<div style="text-align:center;margin:24px 0 8px 0;">${html}</div>`
}

/** Avatar circle (40x40) with initial letter fallback */
export function avatar(url: string | null | undefined, name: string, size = 40): string {
    const initial = (name || '?').trim().charAt(0).toUpperCase()
    if (url) {
        return `<img src="${url}" alt="${initial}" width="${size}" height="${size}" style="display:inline-block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;vertical-align:middle;">`
    }
    return `<span style="display:inline-block;width:${size}px;height:${size}px;line-height:${size}px;border-radius:50%;background:${BRAND};color:#ffffff;text-align:center;font-weight:700;font-size:${Math.floor(size / 2.2)}px;vertical-align:middle;">${initial}</span>`
}

/** Key-value row (label : value) used in task detail emails */
export function detailRow(label: string, value: string, valueColor = TEXT_PRIMARY): string {
    return `<tr>
<td style="padding:6px 0;color:${TEXT_SECONDARY};font-size:13px;width:120px;vertical-align:top;">${label}</td>
<td style="padding:6px 0;color:${valueColor};font-size:13px;font-weight:600;">${value}</td>
</tr>`
}
