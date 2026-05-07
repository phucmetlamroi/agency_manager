import type { TaskOverdueParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, card, ctaRow, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime } from '../shared/format'
import { renderStatusBadge } from '../shared/statusMap'

export async function taskOverdue(params: TaskOverdueParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const assigneeEsc = escapeHtml(params.assigneeName)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl

    const isManager = !!params.isManagerView

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Trạng thái:</td><td style="padding:5px 0;">${renderStatusBadge(params.status)}</td></tr>
<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Deadline:</td><td style="padding:5px 0;color:${COLORS.DANGER};font-size:13px;font-weight:700;">${formatVietnamDateTime(params.deadline)}</td></tr>
<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">${isManager ? 'Assignee:' : 'Quá hạn từ:'}</td><td style="padding:5px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${isManager ? assigneeEsc : formatVietnamDateTime(params.deadline)}</td></tr>
</table>
<p style="margin:14px 0 0 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">${isManager ? `Assignee <strong>${assigneeEsc}</strong> chưa hoàn thành task này. Vui lòng theo dõi tiến độ.` : 'Vui lòng cập nhật trạng thái hoặc liên hệ manager để xin gia hạn.'}</p>`

    const body = `
${heading('❗', 'Task đã quá hạn')}
${banner(`❗ Quá hạn ${params.overdueDuration}`, 'danger')}
${card(inner, COLORS.DANGER)}
${ctaRow([{ text: isManager ? '📋 Xem task →' : '📋 Cập nhật task →', url: taskLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_OVERDUE',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `❗ Task đã quá hạn: "${params.taskTitle}"`,
        html,
    }
}
