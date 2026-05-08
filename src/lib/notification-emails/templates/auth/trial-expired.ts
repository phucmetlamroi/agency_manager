/**
 * Auth Phase 4 — Email template: Trial expired notification.
 */

import { COLORS } from '../../shared/wrapTemplate'

interface TrialExpiredParams {
    displayName: string
    upgradeUrl: string
}

export function buildTrialExpiredEmail(params: TrialExpiredParams): { subject: string; html: string } {
    const { displayName, upgradeUrl } = params

    const subject = `Trial HustlyTasker đã hết hạn`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">📌 Trial đã kết thúc</h1>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(displayName)}</strong>,</p>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Cảm ơn bạn đã dùng thử HustlyTasker trong 14 ngày qua! Trial của bạn đã hết hạn hôm nay.</p>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">
<strong style="color:${COLORS.SUCCESS};">✅ Tin tốt:</strong> Tất cả dữ liệu của bạn vẫn được giữ nguyên. Bạn có thể nâng cấp lên gói trả phí bất cứ lúc nào để tiếp tục sử dụng đầy đủ tính năng.
</p>

<div style="background:#fef3c7;border:1px solid ${COLORS.WARNING};border-radius:8px;padding:14px 16px;margin:20px 0;color:#92400e;font-size:13px;">
<strong>Tài khoản hiện tại:</strong> Truy cập giới hạn (chỉ xem). Nâng cấp để mở khóa toàn bộ workspace.
</div>

<div style="text-align:center;margin:28px 0;">
<a href="${upgradeUrl}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">⚡ Nâng cấp tài khoản</a>
</div>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Có câu hỏi? Liên hệ <a href="mailto:support@hustlytasker.xyz" style="color:${COLORS.BRAND};">support@hustlytasker.xyz</a>.</p>

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
<title>Trial hết hạn</title>
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
    return { subject, html }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
