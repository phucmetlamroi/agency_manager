/**
 * [BILLING P7] Ba email vòng đời gói — gửi từ cron billing-sweep (path B, build-and-send).
 *   • renewal-reminder (D-7 / D-1): không auto-charge (SCHEMA-DE-XUAT §8) nên email nhắc
 *     LÀ cơ chế gia hạn duy nhất — thiếu nó khách rơi vào GRACE trong im lặng.
 *   • grace-started: hết hạn → chỉ-đọc 30 ngày (D6). Nói rõ CÁI GÌ còn dùng được.
 *   • expired: hết GRACE → khoá. Nói rõ dữ liệu CHƯA mất và cửa quay lại.
 * Cùng khung HTML với payment-received để nhận diện thương hiệu nhất quán.
 */

import { COLORS } from '../../shared/wrapTemplate'

const fmtDate = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`
}

function shell(subject: string, body: string): { subject: string; html: string } {
    const html = `<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:${COLORS.BG};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:${COLORS.TEXT_PRIMARY};line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${COLORS.BG};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,${COLORS.BRAND_DARK},${COLORS.BRAND});padding:24px 32px;">
<div style="display:inline-block;background:rgba(255,255,255,0.18);border-radius:10px;padding:8px 14px;">
<span style="font-size:18px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">⚡ HustlyTasker</span>
</div></td></tr>
<tr><td style="padding:32px;">${body}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
    return { subject, html }
}

const cta = (href: string, label: string) => `
<div style="text-align:center;margin:28px 0;">
<a href="${href}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">${label}</a>
</div>`

const signoff = `<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Trân trọng,<br><strong>Đội ngũ HustlyTasker</strong></p>`

export function buildRenewalReminderEmail(p: {
    profileName: string
    planLabel: string
    periodEndISO: string
    daysLeft: number
    billingUrl: string
}): { subject: string; html: string } {
    const subject = `Gói ${p.planLabel} còn ${p.daysLeft} ngày — gia hạn để không gián đoạn`
    return shell(subject, `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};">⏳ Gói sắp đến hạn</h1>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Gói <strong>${escapeHtml(p.planLabel)}</strong> của tổ chức <strong>${escapeHtml(p.profileName)}</strong> hết hạn ngày <strong>${fmtDate(p.periodEndISO)}</strong>.</p>
<p style="margin:0 0 8px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Hệ thống không tự trừ tiền — mở trang Gói cước, bấm gia hạn và quét mã QR là xong (kích hoạt tự động trong ~10 giây).</p>
${cta(p.billingUrl, 'Gia hạn ngay')}
<p style="margin:0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Quá hạn, dữ liệu chuyển sang chế độ chỉ-đọc trong 30 ngày — không mất gì, nhưng đội của bạn sẽ không tạo mới được.</p>
${signoff}`)
}

export function buildGraceStartedEmail(p: {
    profileName: string
    planLabel: string
    graceEndsISO: string
    billingUrl: string
}): { subject: string; html: string } {
    const subject = `Gói ${p.planLabel} đã hết hạn — dữ liệu đang ở chế độ chỉ-đọc`
    return shell(subject, `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};">🔒 Chỉ-đọc</h1>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Gói của tổ chức <strong>${escapeHtml(p.profileName)}</strong> đã hết hạn. Từ giờ tới <strong>${fmtDate(p.graceEndsISO)}</strong>:</p>
<ul style="margin:0 0 16px 0;padding-left:20px;color:${COLORS.TEXT_PRIMARY};font-size:14px;">
<li>Vẫn XEM và TẢI được toàn bộ dữ liệu, video, hoá đơn.</li>
<li>Không tạo task / tải video mới / mời thành viên được.</li>
<li>Cổng khách hàng của bạn vẫn hoạt động bình thường.</li>
</ul>
<p style="margin:0 0 8px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Gia hạn bất cứ lúc nào là mọi thứ mở lại ngay lập tức.</p>
${cta(p.billingUrl, 'Gia hạn ngay')}
${signoff}`)
}

export function buildExpiredEmail(p: {
    profileName: string
    billingUrl: string
}): { subject: string; html: string } {
    const subject = `Tài khoản tổ chức ${p.profileName} đã bị khoá — dữ liệu vẫn được giữ`
    return shell(subject, `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};">⛔ Đã khoá</h1>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Thời gian chỉ-đọc 30 ngày của tổ chức <strong>${escapeHtml(p.profileName)}</strong> đã kết thúc. Tài khoản chuyển sang trạng thái khoá.</p>
<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;"><strong>Dữ liệu của bạn CHƯA bị xoá.</strong> Kích hoạt lại một gói bất kỳ (hoặc nhập code) là toàn bộ task, video và lịch sử quay lại nguyên vẹn.</p>
${cta(p.billingUrl, 'Kích hoạt lại')}
<p style="margin:0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Cần xuất dữ liệu hoặc có câu hỏi? Trả lời email này hoặc viết cho support@hustlytasker.xyz.</p>
${signoff}`)
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
