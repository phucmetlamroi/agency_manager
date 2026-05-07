import type { MessageDMParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativeVN, truncate } from '../shared/format'

export async function messageDM(params: MessageDMParams): Promise<RenderedEmail> {
    const senderEsc = escapeHtml(params.senderName)
    const previewEsc = escapeHtml(truncate(params.messagePreview, 200))
    const time = formatRelativeVN(params.messageTime)
    const wsId = params.workspaceId
    const chatLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?conversationId=${params.conversationId}`
        : `${params.appUrl}`

    const inner = `
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
${heading('💬', 'Tin nhắn mới')}
${subheading(`<strong>${senderEsc}</strong> vừa gửi cho bạn một tin nhắn.`)}
${card(inner)}
${ctaRow([{ text: '💬 Xem tin nhắn →', url: chatLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'NEW_MESSAGE',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `💬 ${params.senderName} gửi tin nhắn cho bạn`,
        html,
    }
}
