import type { GroupAddedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDate } from '../shared/format'

export async function groupMemberAdded(params: GroupAddedParams): Promise<RenderedEmail> {
    const groupEsc = escapeHtml(params.groupName)
    const adderEsc = escapeHtml(params.adderName)
    const createdAt = formatVietnamDate(params.createdAt)
    const wsId = params.workspaceId
    const chatLink = wsId
        ? `${params.appUrl}/${wsId}/dashboard?conversationId=${params.conversationId}`
        : `${params.appUrl}`

    const visibleMembers = params.memberNames.slice(0, 3)
    const remaining = Math.max(0, params.memberCount - visibleMembers.length)
    const memberRows = visibleMembers.map(n =>
        `<div style="padding:6px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;">👤 ${escapeHtml(n)}</div>`
    ).join('')
    const moreRow = remaining > 0
        ? `<div style="padding:6px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;font-style:italic;">… và ${remaining} người khác</div>`
        : ''

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${groupEsc}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:14px;">
<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:130px;">Được thêm bởi:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${adderEsc}</td></tr>
<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Thành viên:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${params.memberCount} người</td></tr>
<tr><td style="padding:4px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Tạo lúc:</td><td style="padding:4px 0;color:${COLORS.TEXT_PRIMARY};font-size:13px;font-weight:600;">${createdAt}</td></tr>
</table>
<div style="border-top:1px solid ${COLORS.BORDER};padding-top:12px;">
${memberRows}
${moreRow}
</div>`

    const body = `
${heading('👥', 'Bạn đã được thêm vào group')}
${subheading(`<strong>${adderEsc}</strong> đã thêm bạn vào group này.`)}
${card(inner)}
${ctaRow([{ text: '💬 Mở group →', url: chatLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'GROUP_MEMBER_ADDED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `👥 Bạn đã được thêm vào group "${params.groupName}"`,
        html,
    }
}
