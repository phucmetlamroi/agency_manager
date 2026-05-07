import type { TaskStatusChangedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime, formatTimeRemaining } from '../shared/format'
import { renderStatusBadge, getStatusInfo } from '../shared/statusMap'

export async function taskStatusChanged(params: TaskStatusChangedParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const actorEsc = escapeHtml(params.actorName)
    const time = formatVietnamDateTime(params.changedAt)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl
    const newInfo = getStatusInfo(params.newStatus)

    const isDone = newInfo.label === 'Hoàn thành'
    const isRejected = newInfo.label === 'Cần sửa' || newInfo.label === 'Bị từ chối'

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
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
<span style="margin:0 12px;color:${COLORS.TEXT_SECONDARY};font-size:14px;">───→</span>
${renderStatusBadge(params.newStatus)}
</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Thời gian:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${time}</td></tr>
${params.deadline ? `<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Deadline:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${formatVietnamDateTime(params.deadline)} <span style="color:${COLORS.TEXT_SECONDARY};font-weight:400;">(${formatTimeRemaining(params.deadline)})</span></td></tr>` : ''}
</table>`

    const body = `
${heading('📋', 'Task cập nhật trạng thái')}
${subheading(`Trạng thái của task này vừa được thay đổi.`)}
${isDone ? banner('🎉 Tuyệt vời! Task đã hoàn thành.', 'info') : ''}
${isRejected ? banner('⚠️ Task cần được xem xét lại.', 'warn') : ''}
${card(inner)}
${ctaRow([{ text: '📋 Xem task →', url: taskLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_STATUS_CHANGED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `📋 Task "${params.taskTitle}" chuyển sang ${newInfo.label}`,
        html,
    }
}
