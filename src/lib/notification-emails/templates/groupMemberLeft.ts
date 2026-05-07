import type { GroupLeftParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, avatar, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativeVN } from '../shared/format'

export async function groupMemberLeft(params: GroupLeftParams): Promise<RenderedEmail> {
    const groupEsc = escapeHtml(params.groupName)
    const leaverEsc = escapeHtml(params.leaverName)
    const time = formatRelativeVN(params.leftAt)
    const wsId = params.workspaceId
    const chatLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?conversationId=${params.conversationId}`
        : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${groupEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;">
<tr>
<td width="50" valign="top" style="padding-right:12px;">${avatar(params.leaverAvatarUrl, params.leaverName)}</td>
<td valign="top">
<div style="font-weight:700;font-size:14px;color:${COLORS.TEXT_PRIMARY};">${leaverEsc} đã rời group</div>
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;">${time}</div>
</td>
</tr>
</table>
<div style="border-top:1px solid ${COLORS.BORDER};padding-top:10px;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Thành viên còn lại: <strong style="color:${COLORS.TEXT_PRIMARY};">${params.remainingMemberCount} người</strong></div>`

    const body = `
${heading('👥', 'Thành viên rời group')}
${subheading(`<strong>${leaverEsc}</strong> đã tự rời khỏi group "<strong>${groupEsc}</strong>".`)}
${card(inner)}
${ctaRow([{ text: '💬 Mở group →', url: chatLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'GROUP_MEMBER_LEFT',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `👥 ${params.leaverName} đã rời khỏi group "${params.groupName}"`,
        html,
    }
}
