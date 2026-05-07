import type { GroupRemovedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml } from '../shared/format'

export async function groupMemberRemoved(params: GroupRemovedParams): Promise<RenderedEmail> {
    const groupEsc = escapeHtml(params.groupName)
    const removerEsc = escapeHtml(params.removerName)
    const wsId = params.workspaceId
    const homeLink = wsId ? `${params.appUrl}/${wsId}/dashboard` : params.appUrl

    const inner = `
<div style="font-size:18px;font-weight:800;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">📋 ${groupEsc}</div>
<p style="margin:0 0 12px 0;color:${COLORS.TEXT_PRIMARY};font-size:14px;">Bạn đã bị xoá khỏi group này bởi <strong>${removerEsc}</strong>.</p>
<p style="margin:0;color:${COLORS.TEXT_SECONDARY};font-size:13px;">Bạn sẽ không nhận được tin nhắn từ group này nữa. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ người quản lý group.</p>`

    const body = `
${heading('👥', 'Bạn đã bị xoá khỏi group')}
${card(inner, COLORS.DANGER)}
${ctaRow([{ text: '🏠 Về trang chủ →', url: homeLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'GROUP_MEMBER_REMOVED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `👥 Bạn đã bị xoá khỏi group "${params.groupName}"`,
        html,
    }
}
