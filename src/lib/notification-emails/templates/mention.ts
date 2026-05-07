import type { MentionParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, banner, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativeVN, truncate, highlightMention } from '../shared/format'

export async function mention(params: MentionParams): Promise<RenderedEmail> {
    const senderEsc = escapeHtml(params.senderName)
    const convEsc = escapeHtml(params.conversationName)
    const previewHtml = highlightMention(truncate(params.messagePreview, 220), params.recipientName)
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
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;">trong "${convEsc}" · ${time}</div>
</td>
</tr>
</table>
<div style="margin-top:14px;padding:14px;background:#ffffff;border-radius:8px;border:1px solid ${COLORS.BORDER};color:${COLORS.TEXT_PRIMARY};font-size:14px;line-height:1.55;">
${previewHtml}
</div>`

    const body = `
${heading('🔔', 'Bạn được nhắc đến')}
${subheading(`<strong>${senderEsc}</strong> đã nhắc tên bạn trong "<strong>${convEsc}</strong>".`)}
${card(inner, COLORS.BRAND)}
${banner('⚡ Tin nhắn này nhắc đến bạn trực tiếp và yêu cầu phản hồi.', 'warn')}
${ctaRow([{ text: '💬 Trả lời ngay →', url: chatLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'MENTION',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `🔔 ${params.senderName} đã nhắc đến bạn trong "${params.conversationName}"`,
        html,
    }
}
