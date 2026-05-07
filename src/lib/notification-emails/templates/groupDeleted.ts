import type { GroupDeletedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml } from '../shared/format'

export async function groupDeleted(params: GroupDeletedParams): Promise<RenderedEmail> {
    const groupEsc = escapeHtml(params.groupName)
    const creatorEsc = escapeHtml(params.creatorName)
    const wsId = params.workspaceId
    const homeLink = wsId ? `${params.appUrl}/${wsId}/dashboard` : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${groupEsc}</div>
<p style="margin:0 0 12px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Group này đã bị xoá vĩnh viễn bởi <strong>${creatorEsc}</strong> (người tạo group).</p>
<p style="margin:0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Tất cả tin nhắn và dữ liệu trong group đã bị xoá và không thể khôi phục.</p>`

    const body = `
${heading('❌', 'Group đã bị xoá')}
${card(inner, COLORS.DANGER)}
${ctaRow([{ text: '🏠 Về trang chủ →', url: homeLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'GROUP_DELETED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `❌ Group "${params.groupName}" đã bị xoá`,
        html,
    }
}
