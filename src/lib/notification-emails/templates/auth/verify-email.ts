/**
 * Auth Phase 3 — Email template: Verify Email link (signup confirmation).
 *
 * Gửi sau khi user signup; click link trong 24h để mark User.emailVerified = true.
 */

import { COLORS } from '../../shared/wrapTemplate'

interface VerifyEmailParams {
    displayName: string
    verifyUrl: string  // Full URL với raw token query param
    expiresHours: number
}

export function buildVerifyEmailEmail(params: VerifyEmailParams): { subject: string; html: string } {
    const { displayName, verifyUrl, expiresHours } = params

    const subject = `Xác thực email cho HustlyTasker`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">✨ Chào mừng đến HustlyTasker!</h1>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(displayName)}</strong>,</p>

<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Cảm ơn bạn đã đăng ký HustlyTasker! Vui lòng xác thực email bằng cách click nút bên dưới:</p>

<div style="text-align:center;margin:28px 0;">
<a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.01em;">✓ Xác thực email</a>
</div>

<p style="margin:0 0 12px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Hoặc copy link sau vào trình duyệt:</p>
<div style="background:#f9fafb;border:1px solid ${COLORS.BORDER};border-radius:8px;padding:10px 12px;margin:0 0 18px 0;font-family:monospace;font-size:11px;color:${COLORS.TEXT_PRIMARY};word-break:break-all;">
${escapeHtml(verifyUrl)}
</div>

<p style="margin:0 0 8px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">⏱️ Link có hiệu lực trong <strong>${expiresHours} giờ</strong>.</p>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Nếu bạn không đăng ký HustlyTasker, vui lòng bỏ qua email này.</p>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">
Trân trọng,<br>
<strong>Đội ngũ HustlyTasker</strong>
</p>
`

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xác thực email HustlyTasker</title>
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
<p style="margin:0;">© ${new Date().getFullYear()} HustlyTasker. Email tự động — vui lòng không reply.</p>
</div>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`

    return { subject, html }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
