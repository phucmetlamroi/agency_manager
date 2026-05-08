/**
 * Auth Phase 2 — Email template: Password Changed Security Alert.
 *
 * Sent immediately sau khi user reset password thành công.
 * Bao gồm: timestamp, IP, UA, link "Khóa tài khoản" nếu user không thực hiện.
 */

import { COLORS } from '../../shared/wrapTemplate'

interface PasswordChangedParams {
    displayName: string
    timestamp: Date
    ipAddress: string
    userAgent: string | null
    appUrl: string  // base URL e.g. https://hustlytasker.xyz
}

export function buildPasswordChangedEmail(params: PasswordChangedParams): { subject: string; html: string } {
    const { displayName, timestamp, ipAddress, userAgent, appUrl } = params

    const subject = `Mật khẩu HustlyTasker của bạn đã được thay đổi`

    const formatted = timestamp.toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    const lockUrl = `${appUrl}/forgot-password?compromised=1`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">🔒 Mật khẩu đã được thay đổi</h1>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(displayName)}</strong>,</p>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Mật khẩu tài khoản HustlyTasker của bạn vừa được thay đổi:</p>

<div style="background:#f9fafb;border:1px solid ${COLORS.BORDER};border-radius:10px;padding:16px 20px;margin:0 0 20px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:6px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:120px;">🕐 Thời gian:</td>
<td style="padding:6px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${formatted}</td></tr>
<tr><td style="padding:6px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">🌐 Địa chỉ IP:</td>
<td style="padding:6px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-family:monospace;">${escapeHtml(ipAddress)}</td></tr>
${userAgent ? `<tr><td style="padding:6px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">📱 Thiết bị:</td>
<td style="padding:6px 0;color:${COLORS.TEXT_PRIMARY};font-size:12px;word-break:break-all;">${escapeHtml(userAgent)}</td></tr>` : ''}
</table>
</div>

<div style="background:#fee2e2;border:1px solid #dc2626;border-radius:8px;padding:14px 16px;margin:20px 0;color:#991b1b;font-size:13px;line-height:1.5;">
<strong>Nếu bạn KHÔNG thực hiện thay đổi này:</strong><br>
Tài khoản của bạn có thể đã bị xâm phạm. Click ngay link bên dưới để đặt lại mật khẩu:
</div>

<div style="text-align:center;margin:24px 0 8px 0;">
<a href="${lockUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#ffffff;border:2px solid #dc2626;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">🔐 Khóa tài khoản & Đặt lại mật khẩu</a>
</div>

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
<title>Mật khẩu đã thay đổi - HustlyTasker</title>
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
<p style="margin:0;">© ${new Date().getFullYear()} HustlyTasker. Email bảo mật — không reply.</p>
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
