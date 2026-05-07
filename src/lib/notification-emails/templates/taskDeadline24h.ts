import type { TaskDeadlineParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, card, ctaRow, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime, formatTimeRemaining } from '../shared/format'
import { renderStatusBadge } from '../shared/statusMap'

export async function taskDeadline24h(params: TaskDeadlineParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const assignerEsc = params.assignerName ? escapeHtml(params.assignerName) : null
    const remaining = formatTimeRemaining(params.deadline)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Trạng thái:</td><td style="padding:5px 0;">${renderStatusBadge(params.status)}</td></tr>
<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Deadline:</td><td style="padding:5px 0;color:${COLORS.WARNING};font-size:13px;font-weight:700;">${formatVietnamDateTime(params.deadline)}</td></tr>
${assignerEsc ? `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Giao bởi:</td><td style="padding:5px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${assignerEsc}</td></tr>` : ''}
</table>
<p style="margin:14px 0 0 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Hãy đảm bảo hoàn thành task trước thời hạn nhé!</p>`

    const body = `
${heading('⏰', 'Deadline sắp đến')}
${banner(`⏰ ${remaining}`, 'warn')}
${card(inner, COLORS.WARNING)}
${ctaRow([{ text: '📋 Xem task →', url: taskLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_DEADLINE_APPROACHING',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `⏰ Deadline còn 24 giờ: "${params.taskTitle}"`,
        html,
    }
}
