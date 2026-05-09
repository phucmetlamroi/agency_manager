/**
 * Email template: Workspace Invitation.
 *
 * Gửi cho invitee khi admin invite họ vào workspace. Email có CTA "Vào HustlyTasker"
 * → đăng nhập → dashboard → bell hiển thị notification + PendingInvitationsBanner
 * cho user click Accept/Decline.
 *
 * Pattern mimic verify-email.ts (self-contained HTML, không qua wrapTemplate vì
 * wrapTemplate yêu cầu recipientUserId + workspaceId — invite email không workspace
 * scoped).
 */

import { COLORS } from '../../shared/wrapTemplate'

interface WorkspaceInvitationParams {
    inviteeName: string
    inviterName: string
    workspaceName: string
    role: string  // OWNER/ADMIN/MEMBER/GUEST
    appUrl: string  // base URL — link CTA tới /login
    expiresHours: number  // 14*24 = 336h
}

const ROLE_LABEL: Record<string, string> = {
    OWNER: 'Chủ sở hữu',
    ADMIN: 'Quản trị',
    MEMBER: 'Thành viên',
    GUEST: 'Khách',
}

export function buildWorkspaceInvitationEmail(params: WorkspaceInvitationParams): { subject: string; html: string } {
    const { inviteeName, inviterName, workspaceName, role, appUrl, expiresHours } = params
    const roleLabel = ROLE_LABEL[role] ?? role
    const loginUrl = `${appUrl.replace(/\/$/, '')}/login`

    const subject = `${inviterName} mời bạn tham gia workspace "${workspaceName}"`

    const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">📨 Bạn nhận được lời mời!</h1>
<p style="margin:0 0 20px 0;color:${COLORS.TEXT_SECONDARY};font-size:14px;">Chào <strong>${escapeHtml(inviteeName)}</strong>,</p>

<p style="margin:0 0 16px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;"><strong>${escapeHtml(inviterName)}</strong> đã mời bạn tham gia workspace dưới đây trên HustlyTasker:</p>

<div style="background:#f9fafb;border:1px solid ${COLORS.BORDER};border-radius:10px;padding:14px 16px;margin:0 0 22px 0;">
<p style="margin:0 0 6px 0;color:${COLORS.TEXT_SECONDARY};font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Workspace</p>
<p style="margin:0 0 12px 0;color:${COLORS.TEXT_PRIMARY};font-size:16px;font-weight:700;">${escapeHtml(workspaceName)}</p>
<p style="margin:0 0 6px 0;color:${COLORS.TEXT_SECONDARY};font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">Vai trò</p>
<p style="margin:0;color:${COLORS.TEXT_PRIMARY};font-size:14px;font-weight:600;">${escapeHtml(roleLabel)}</p>
</div>

<div style="text-align:center;margin:28px 0;">
<a href="${loginUrl}" style="display:inline-block;padding:14px 32px;background:${COLORS.BRAND};color:#ffffff;border:2px solid ${COLORS.BRAND};text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;letter-spacing:0.01em;">→ Vào HustlyTasker</a>
</div>

<p style="margin:0 0 12px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Sau khi đăng nhập, bạn sẽ thấy lời mời ở chuông thông báo (góc trên) và banner ở dashboard. Bấm <strong>Tham gia</strong> để vào workspace, hoặc <strong>Từ chối</strong> để bỏ qua.</p>

<p style="margin:0 0 8px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">⏱️ Lời mời có hiệu lực trong <strong>${Math.round(expiresHours / 24)} ngày</strong>.</p>

<p style="margin:24px 0 0 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Nếu bạn không quen biết người mời hoặc không muốn tham gia, bỏ qua email này — lời mời sẽ tự hết hạn.</p>

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
<title>Lời mời tham gia workspace</title>
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
