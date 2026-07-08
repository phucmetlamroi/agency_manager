import type { ReviewClientDecisionParams, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, subheading, card, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml } from '../shared/format'

// [L-EMAIL-3] Staff email when the CLIENT makes a review decision on /r/{slug}. Both the
// editor (assignee) and the manager (assignedById) are the recipients — set by the Inngest
// review-share-decision notify-staff step. Professional VN, no emoji. Covers the full loop:
// every client approve / request-changes round emails the team.
export async function reviewClientDecision(params: ReviewClientDecisionParams): Promise<RenderedEmail> {
    const titleEsc = escapeHtml(params.taskTitle)
    const who = escapeHtml(params.guestName || 'Khách hàng')
    const vLabel = params.versionNumber ? ` (bản v${params.versionNumber})` : ''
    const taskLink = params.workspaceId
        ? `${params.appUrl}/${params.workspaceId}/dashboard?taskId=${params.taskId}`
        : params.appUrl

    const isApprove = params.decision === 'approve'
    const headlineText = isApprove ? 'Khách đã duyệt bản dựng' : 'Khách yêu cầu chỉnh sửa'
    const lineText = isApprove
        ? `${who} đã duyệt bản dựng${vLabel} của task này. Mở task để xác nhận chuyển sang Hoàn tất.`
        : `${who} vừa yêu cầu chỉnh sửa bản dựng${vLabel} của task này. Mở task để xem feedback và sửa lại.`

    const inner = `
<div style="font-size:16px;font-weight:700;color:${COLORS.TEXT_PRIMARY};margin-bottom:8px;">${titleEsc}</div>
<div style="font-size:13px;color:${COLORS.TEXT_SECONDARY};">${lineText}</div>`

    const body = `
${heading('', headlineText)}
${subheading(isApprove ? 'Task đã sẵn sàng để chốt hoàn tất.' : 'Cần bạn xử lý feedback của khách.')}
${card(inner, isApprove ? COLORS.SUCCESS : COLORS.WARNING)}
${ctaRow([{ text: 'Xem task', url: taskLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: isApprove ? 'VIDEO_REVIEW_APPROVED' : 'VIDEO_CHANGES_REQUESTED',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `${headlineText} — "${params.taskTitle}"`,
        html,
    }
}
