/**
 * Auth Phase 2 — Email template: Password Reset OTP.
 *
 * UX note: OTP có trong subject để hiển thị lock screen iOS/Android mà không
 * cần mở email — UX tốt cho user Việt Nam dùng nhiều mobile (theo §9.2 spec).
 *
 * Template KHÔNG dùng wrapTemplate() vì auth emails KHÔNG có unsubscribe footer
 * (bắt buộc transactional). Dùng inline shell tối giản.
 */

import { COLORS, heading } from '../../shared/wrapTemplate'

interface PasswordResetOtpParams {
    displayName: string
    otp: string         // 6-digit plaintext OTP
    expiresMinutes: number  // typically 10
}

export function buildPasswordResetOtpEmail(params: PasswordResetOtpParams): { subject: string; html: string } {
    const { displayName, otp, expiresMinutes } = params

    // Format OTP với khoảng cách giữa các chữ số (1 2 3 4 5 6) để dễ đọc
    const otpDisplay = otp.split('').join(' ')

    const subject = `Mã xác thực đặt lại mật khẩu HustlyTasker: ${otp}`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">🔐 Mã xác thực của bạn</h1>
<p style="margin:0 0 24px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(displayName)}</strong>,</p>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Bạn vừa yêu cầu đặt lại mật khẩu HustlyTasker. Vui lòng nhập mã xác thực dưới đây:</p>

<div style="background:#f3f4f6;border:2px dashed ${COLORS.BRAND};border-radius:12px;padding:24px;margin:0 0 20px 0;text-align:center;">
<div style="font-family:'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:0.3em;color:${COLORS.BRAND_DARK};">${otpDisplay}</div>
</div>

<p style="margin:0 0 12px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">⏱️ Mã có hiệu lực trong <strong>${expiresMinutes} phút</strong>.</p>

<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:20px 0 8px 0;color:#92400e;font-size:13px;line-height:1.5;">
<strong>⚠️ KHÔNG chia sẻ mã này với bất kỳ ai.</strong><br>
Nhân viên HustlyTasker sẽ <strong>KHÔNG BAO GIỜ</strong> hỏi mã này.
</div>

<p style="margin:20px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này và liên hệ hỗ trợ nếu nghi ngờ tài khoản bị xâm phạm.</p>

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
<title>Mã xác thực HustlyTasker</title>
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
<tr>
<td style="padding:32px 32px 32px 32px;">
${body}
</td>
</tr>
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
