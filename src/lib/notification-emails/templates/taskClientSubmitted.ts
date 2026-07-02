import type { TaskClientSubmittedParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, card, ctaRow, detailRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatVietnamDateTime } from '../shared/format'

/**
 * [Client Task Submission v2] Email sent to every profile OWNER/ADMIN when a
 * client submits a new work request via the share portal.
 *
 * Copy is deliberately Vietnamese, plain and professional — no emoji / cliché
 * icons (the header wordmark aside). Natural business tone per the owner's brief.
 */
export async function taskClientSubmitted(params: TaskClientSubmittedParams): Promise<RenderedEmail> {
    const brand = escapeHtml(params.brand)
    const project = escapeHtml(params.projectTitle)
    const month = params.monthLabel ? escapeHtml(params.monthLabel) : null
    const notes = params.clientNotes ? escapeHtml(params.clientNotes) : null
    const time = formatVietnamDateTime(params.submittedAt)
    const inboxLink = `${params.appUrl}/${params.inboxWorkspaceId}/admin/requests`

    const rawRow = params.rawLink
        ? `<tr><td style="padding:6px 0;color:${COLORS.TEXT_SECONDARY};font-size:13px;width:120px;vertical-align:top;">Link raw</td><td style="padding:6px 0;font-size:13px;"><a href="${escapeHtml(params.rawLink)}" style="color:${COLORS.BRAND};font-weight:600;word-break:break-all;">${escapeHtml(params.rawLink)}</a></td></tr>`
        : ''

    const inner = `
<div style="font-size:16px;font-weight:700;color:${COLORS.TEXT_PRIMARY};margin-bottom:14px;">${project}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
${detailRow('Khách hàng', brand)}
${month ? detailRow('Tháng', month) : ''}
${rawRow}
${detailRow('Ghi chú của khách', notes || '(không có)')}
${detailRow('Thời gian gửi', time)}
</table>`

    const body = `
<h1 style="margin:0 0 16px 0;font-size:20px;font-weight:800;color:${COLORS.TEXT_PRIMARY};letter-spacing:-0.01em;">Yêu cầu mới từ khách hàng</h1>
<p style="margin:0 0 6px 0;font-size:15px;color:${COLORS.TEXT_PRIMARY};">Chào ${escapeHtml(params.recipientName)},</p>
<p style="margin:0 0 20px 0;font-size:14px;color:${COLORS.TEXT_SECONDARY};line-height:1.6;">Khách hàng <strong style="color:${COLORS.TEXT_PRIMARY};">${brand}</strong> vừa gửi một yêu cầu công việc mới qua cổng portal. Yêu cầu đang nằm trong <strong style="color:${COLORS.TEXT_PRIMARY};">Hộp thư yêu cầu</strong>, chờ bạn xem và phân công.</p>
${card(inner)}
${ctaRow([{ text: 'Mở yêu cầu', url: inboxLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'TASK_CLIENT_SUBMITTED',
        appUrl: params.appUrl,
        workspaceId: params.inboxWorkspaceId,
    })

    return {
        subject: `Yêu cầu mới từ khách hàng — ${params.brand}`,
        html,
    }
}
