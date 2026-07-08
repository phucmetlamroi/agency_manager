import type { TaskStatusChangedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime, formatTimeRemaining } from '../shared/format'
import { renderStatusBadge } from '../shared/statusMap'

// [L-EMAIL-1] Per-transition copy for the VIDEO REVIEW lifecycle, keyed by the canonical
// Task.status VALUE. Professional VN tone, no emoji. Every review flip rides the single
// TASK_STATUS_CHANGED template, so this map lets the ONE email say something specific for
// each step; any non-review status falls back to a clean generic line.
const REVIEW_FLIP_COPY: Record<string, { headline: string; line: string; tone?: 'success' | 'warn' }> = {
    'Đã nộp video (nội bộ)':      { headline: 'Video đã nộp — cần duyệt nội bộ',            line: 'Editor đã nộp bản dựng. Mở task để xem và gửi feedback.' },
    'Đang sửa feedback (nội bộ)': { headline: 'Có feedback cần sửa',                        line: 'Quản lý đã gửi feedback. Mở task để xem và sửa lại.', tone: 'warn' },
    'Đã sửa feedback (nội bộ)':   { headline: 'Đã sửa xong — chờ duyệt',                    line: 'Editor xác nhận đã sửa xong đợt feedback này. Mở task để duyệt và gửi cho khách.' },
    'Đã gửi video (khách)':       { headline: 'Đã gửi cho khách duyệt',                     line: 'Bản dựng đã được gửi cho khách. Đang chờ khách phản hồi.' },
    'Đã nhận feedback (khách)':   { headline: 'Khách đã gửi feedback',                      line: 'Khách vừa yêu cầu chỉnh sửa. Mở task để xem feedback và sửa.', tone: 'warn' },
    'Đã sửa feedback (khách)':    { headline: 'Đã sửa xong feedback khách — chờ duyệt',     line: 'Editor xác nhận đã sửa feedback của khách. Mở task để duyệt và gửi lại cho khách.' },
    'Hoàn tất':                   { headline: 'Khách đã duyệt — hoàn tất',                  line: 'Khách đã duyệt bản dựng. Task đã hoàn tất.', tone: 'success' },
}

export async function taskStatusChanged(params: TaskStatusChangedParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const actorEsc = escapeHtml(params.actorName)
    const time = formatVietnamDateTime(params.changedAt)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl

    const flip = REVIEW_FLIP_COPY[params.newStatus]
    const headlineText = flip?.headline ?? 'Cập nhật trạng thái task'
    const lineText = flip?.line ?? 'Trạng thái của task này vừa được cập nhật.'

    const inner = `
<div style="font-size:16px;font-weight:700;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">${titleEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;">
<tr>
<td width="50" valign="top" style="padding-right:12px;">${avatar(params.actorAvatarUrl, params.actorName)}</td>
<td valign="top">
<div style="font-weight:700;font-size:14px;color:${COLORS.TEXT_PRIMARY};">${actorEsc}</div>
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;">đã cập nhật trạng thái</div>
</td>
</tr>
</table>
<div style="text-align:center;padding:14px;background:#ffffff;border-radius:8px;border:1px solid ${COLORS.BORDER};margin-bottom:12px;">
${renderStatusBadge(params.oldStatus)}
<span style="margin:0 12px;color:${COLORS.TEXT_SECONDARY};font-size:14px;">→</span>
${renderStatusBadge(params.newStatus)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Thời gian:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${time}</td></tr>
${params.deadline ? `<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Deadline:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${formatVietnamDateTime(params.deadline)} <span style="color:${COLORS.TEXT_SECONDARY};font-weight:400;">(${formatTimeRemaining(params.deadline)})</span></td></tr>` : ''}
</table>`

    const body = `
${heading('', headlineText)}
${subheading(lineText)}
${flip?.tone === 'success' ? banner('Task đã hoàn tất.', 'info') : ''}
${flip?.tone === 'warn' ? banner('Cần bạn xử lý.', 'warn') : ''}
${card(inner)}
${ctaRow([{ text: 'Xem task', url: taskLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_STATUS_CHANGED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: flip ? `${headlineText} — "${params.taskTitle}"` : `Cập nhật trạng thái — "${params.taskTitle}"`,
        html,
    }
}
