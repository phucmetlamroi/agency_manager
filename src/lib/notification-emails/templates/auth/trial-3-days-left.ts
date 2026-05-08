/**
 * Auth Phase 4 — Email template: Trial 3 days left reminder.
 */

import { COLORS } from '../../shared/wrapTemplate'

interface TrialReminderParams {
    displayName: string
    daysRemaining: number
    upgradeUrl: string  // CTA link tới trang upgrade
}

export function buildTrial3DaysLeftEmail(params: TrialReminderParams): { subject: string; html: string } {
    const { displayName, daysRemaining, upgradeUrl } = params

    const subject = `Trial của bạn còn ${daysRemaining} ngày nữa - HustlyTasker`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">⏰ Trial sắp hết hạn</h1>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(displayName)}</strong>,</p>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Cảm ơn bạn đã trải nghiệm HustlyTasker! Bạn còn <strong style="color:${COLORS.WARNING};">${daysRemaining} ngày</strong> dùng thử miễn phí.</p>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Để tiếp tục sử dụng đầy đủ tính năng (quản lý task không giới hạn, mời team, audit log...), vui lòng nâng cấp tài khoản.</p>

<div style="text-align:center;margin:28px 0;">
<a href="${upgradeUrl}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">⚡ Nâng cấp ngay</a>
</div>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Sau khi trial hết hạn, dữ liệu của bạn vẫn được giữ nguyên — bạn có thể nâng cấp bất cứ lúc nào.</p>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">
Trân trọng,<br>
<strong>Đội ngũ HustlyTasker</strong>
</p>
`

    const html = wrapHtml(body, 'Trial sắp hết hạn')
    return { subject, html }
}

function wrapHtml(body: string, title: string): string {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COLORS.TEXT_PRIMARY};line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
<tr>
<td style="background:linear-gradient(135deg,${COLORS.BRAND_DARK},${COLORS.BRAND});padding:24px 32px;">
<div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:10px;padding:8px 14px;">
<span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">⚡ HustlyTasker</span>
</div>
</td>
</tr>
<tr><td style="padding:32px 32px 32px 32px;">${body}</td></tr>
<tr>
<td style="padding:0 32px 28px 32px;">
<div style="border-top:1px solid ${COLORS.BORDER};padding-top:16px;font-size:11px;color:#9ca3af;">
<p style="margin:0;">© ${new Date().getFullYear()} HustlyTasker.</p>
</div>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
