/**
 * [BILLING P4] Email "Đã nhận thanh toán" — gửi cho OWNER/ADMIN của tổ chức ngay khi
 * webhook SePay khớp lệnh và gói được kích hoạt. Path B (build-and-send, như templates/auth/):
 * không có hàng Notification tương ứng, gọi thẳng từ webhook, fire-and-forget.
 */

import { COLORS } from '../../shared/wrapTemplate'

interface PaymentReceivedParams {
    profileName: string
    planLabel: string // "Studio" | "Agency" | "Scale"
    cycleLabel: string // "1 tháng" | "12 tháng"
    amountVND: number
    periodEndISO: string // hạn mới sau khi kích hoạt
    billingUrl: string // deep link về trang Gói cước
}

const fmtVND = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' ₫'
const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

export function buildPaymentReceivedEmail(params: PaymentReceivedParams): { subject: string; html: string } {
    const { profileName, planLabel, cycleLabel, amountVND, periodEndISO, billingUrl } = params
    const subject = `Đã nhận thanh toán — gói ${planLabel} đã kích hoạt`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">✅ Đã nhận thanh toán</h1>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Tổ chức <strong>${escapeHtml(profileName)}</strong> vừa được kích hoạt gói mới.</p>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f9fafb;border:1px solid ${COLORS.BORDER};border-radius:10px;margin:0 0 20px 0;">
<tr><td style="padding:14px 18px;font-size:13px;color:${COLORS.TEXT_SECONDARY};">Gói</td><td style="padding:14px 18px;font-size:13px;font-weight:700;color:${COLORS.TEXT_PRIMARY};text-align:right;">${escapeHtml(planLabel)} · ${escapeHtml(cycleLabel)}</td></tr>
<tr><td style="padding:0 18px 14px;font-size:13px;color:${COLORS.TEXT_SECONDARY};">Số tiền</td><td style="padding:0 18px 14px;font-size:13px;font-weight:700;color:${COLORS.TEXT_PRIMARY};text-align:right;">${fmtVND(amountVND)}</td></tr>
<tr><td style="padding:0 18px 14px;font-size:13px;color:${COLORS.TEXT_SECONDARY};">Dùng đến</td><td style="padding:0 18px 14px;font-size:13px;font-weight:700;color:${COLORS.TEXT_PRIMARY};text-align:right;">${fmtDate(periodEndISO)}</td></tr>
</table>

<div style="text-align:center;margin:28px 0;">
<a href="${billingUrl}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">Xem gói của tổ chức</a>
</div>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Email này là biên nhận nội bộ của HustlyTasker, không phải hoá đơn VAT.</p>

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
<title>${subject}</title>
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
<tr><td style="padding:32px;">${body}</td></tr>
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
