import type { MessageGroupParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativeVN, truncate } from '../shared/format'

export async function messageGroup(params: MessageGroupParams): Promise<RenderedEmail> {
    const senderEsc = escapeHtml(params.senderName)
    const groupEsc = escapeHtml(params.groupName)
    const previewEsc = escapeHtml(truncate(params.messagePreview, 200))
    const time = formatRelativeVN(params.messageTime)
    const wsId = params.workspaceId
    const chatLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?conversationId=${params.conversationId}`
        : `${params.appUrl}`

    const inner = `
<div style="display:inline-block;padding:6px 12px;background:${COLORS.BRAND}15;border-radius:8px;color:${COLORS.BRAND};font-weight:700;font-size:13px;margin-bottom:14px;">📋 ${groupEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr>
<td width="50" valign="top" style="padding-right:12px;">${avatar(params.senderAvatarUrl, params.senderName)}</td>
<td valign="top">
<div style="font-weight:700;font-size:14px;color:${COLORS.TEXT_PRIMARY};">${senderEsc}</div>
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;">${time}</div>
</td>
</tr>
</table>
<div style="margin-top:14px;padding:14px;background:#ffffff;border-radius:8px;border:1px solid ${COLORS.BORDER};color:${COLORS.TEXT_PRIMARY};font-size:14px;line-height:1.55;">
"${previewEsc}"
</div>`

    const body = `
${heading('💬', 'Tin nhắn mới trong group')}
${subheading(`<strong>${senderEsc}</strong> vừa gửi tin nhắn trong "<strong>${groupEsc}</strong>".`)}
${card(inner)}
${ctaRow([{ text: '💬 Mở group chat →', url: chatLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'NEW_MESSAGE',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `💬 ${params.senderName} trong "${params.groupName}"`,
        html,
    }
}
