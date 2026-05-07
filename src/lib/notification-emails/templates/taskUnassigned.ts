import type { TaskUnassignedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, card, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml } from '../shared/format'

export async function taskUnassigned(params: TaskUnassignedParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const unassignerEsc = escapeHtml(params.unassignerName)
    const wsId = params.workspaceId
    const tasksLink = wsId ? `${params.appUrl}/${wsId}/dashboard` : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
<p style="margin:0 0 12px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Bạn đã được gỡ khỏi task này bởi <strong>${unassignerEsc}</strong>.</p>
<p style="margin:0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Bạn sẽ không nhận thông báo cập nhật về task này nữa.</p>`

    const body = `
${heading('📋', 'Bạn đã được gỡ khỏi task')}
${card(inner, COLORS.TEXT_SECONDARY)}
${ctaRow([{ text: '🏠 Xem danh sách task →', url: tasksLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_UNASSIGNED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `📋 Bạn đã được gỡ khỏi task: "${params.taskTitle}"`,
        html,
    }
}
