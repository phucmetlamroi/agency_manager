import type { TaskCommentParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, card, ctaRow, avatar, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativeVN, truncate } from '../shared/format'

export async function taskComment(params: TaskCommentParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const commenterEsc = escapeHtml(params.commenterName)
    const previewEsc = escapeHtml(truncate(params.commentPreview, 200))
    const time = formatRelativeVN(params.commentTime)
    const wsId = params.workspaceId
    const taskLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?taskId=${params.taskId}`
        : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${titleEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td width="50" valign="top" style="padding-right:12px;">${avatar(params.commenterAvatarUrl, params.commenterName)}</td>
<td valign="top">
<div style="font-weight:700;font-size:14px;color:${COLORS.TEXT_PRIMARY};">${commenterEsc}</div>
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;">${time}</div>
</td>
</tr>
</table>
<div style="margin-top:14px;padding:14px;background:#ffffff;border-radius:8px;border:1px solid ${COLORS.BORDER};color:${COLORS.TEXT_PRIMARY};font-size:14px;line-height:1.55;">
"${previewEsc}"
</div>`

    const body = `
${heading('💬', 'Comment mới trên task')}
${card(inner)}
${ctaRow([{ text: '📋 Xem task →', url: taskLink }, { text: '💬 Trả lời', url: taskLink, variant: 'secondary' }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_COMMENT',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `💬 ${params.commenterName} comment trên task "${params.taskTitle}"`,
        html,
    }
}
