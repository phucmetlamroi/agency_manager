import type { TaskAssignedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime, truncate } from '../shared/format'
import { renderStatusBadge, getPriorityInfo } from '../shared/statusMap'

export async function taskAssigned(params: TaskAssignedParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const assignerEsc = escapeHtml(params.assignerName)
    const projectEsc = params.projectName ? escapeHtml(params.projectName) : null
    const descEsc = params.description ? escapeHtml(truncate(params.description, 250)) : null
    const deadlineStr = params.deadline ? formatVietnamDateTime(params.deadline) : 'Không có hạn chót'
    const priority = getPriorityInfo(params.priority)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl
    const chatLink = params.conversationId && wsId
        ? `${params.appUrl}/${wsId}/dashboard?conversationId=${params.conversationId}`
        : null

    // Deadline urgency check (< 24h)
    const urgent = params.deadline
        ? params.deadline.getTime() - Date.now() < 24 * 60 * 60 * 1000
        : false

    const detailRows = [
        `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Giao bởi:</td><td style="padding:5px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${assignerEsc}</td></tr>`,
        projectEsc ? `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Dự án:</td><td style="padding:5px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${projectEsc}</td></tr>` : '',
        `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Trạng thái:</td><td style="padding:5px 0;">${renderStatusBadge(params.status)}</td></tr>`,
        priority ? `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Độ ưu tiên:</td><td style="padding:5px 0;color:${priority.color};font-size:13px;font-weight:700;">${priority.icon} ${priority.label}</td></tr>` : '',
        `<tr><td style="padding:5px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Deadline:</td><td style="padding:5px 0;color:${urgent ? COLORS.DANGER : COLORS.TEXT_PRIMARY};font-size:13px;font-weight:700;">${deadlineStr}${urgent ? ' ⚠️' : ''}</td></tr>`,
    ].filter(Boolean).join('')

    const descBlock = descEsc
        ? `<div style="margin-top:14px;padding:12px;background:#ffffff;border-radius:8px;border:1px solid ${COLORS.BORDER};">
<div style="color:${COLORS.TEXT_SECONDARY};font-size:12px;font-weight:600;text-transform:uppercase;margin-bottom:6px;">Mô tả</div>
<div style="color:${COLORS.TEXT_PRIMARY};font-size:13px;line-height:1.55;">"${descEsc}"</div>
</div>`
        : ''

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${detailRows}
</table>
${descBlock}`

    const buttons = [{ text: '📋 Xem task →', url: taskLink }]
    if (chatLink) buttons.push({ text: '💬 Chat ngay', url: chatLink })

    const body = `
${heading('📋', 'Task mới được giao cho bạn')}
${subheading(`<strong>${assignerEsc}</strong> đã giao cho bạn task này.`)}
${urgent ? banner('⚠️ Deadline còn dưới 24 giờ — ưu tiên xử lý!', 'warn') : ''}
${card(inner)}
${ctaRow(buttons)}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_ASSIGNED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `📋 Bạn được giao task mới: "${params.taskTitle}"`,
        html,
    }
}
