import type { DigestParams, DigestNotificationItem, RenderedEmail } from '../shared/types'
import { wrapTemplate, heading, ctaRow, COLORS } from '../shared/wrapTemplate'
import { escapeHtml, formatRelativePast, truncate } from '../shared/format'

const TYPE_EMOJI: Record<string, string> = {
    NEW_MESSAGE: '💬',
    MENTION: '🔔',
    GROUP_MEMBER_ADDED: '👥',
    GROUP_MEMBER_REMOVED: '👤',
    GROUP_MEMBER_LEFT: '🚪',
    GROUP_DELETED: '❌',
    TASK_ASSIGNED: '📋',
    TASK_UNASSIGNED: '📋',
    TASK_STATUS_CHANGED: '📋',
    TASK_DEADLINE_APPROACHING: '⏰',
    TASK_OVERDUE: '❗',
    TASK_COMMENT: '💬',
}

function priorityRank(item: DigestNotificationItem): number {
    if (item.type === 'TASK_OVERDUE') return 0
    if (item.type === 'TASK_DEADLINE_APPROACHING') return 1
    if (item.type === 'MENTION') return 2
    if (item.type === 'TASK_ASSIGNED') return 3
    if (item.type === 'TASK_STATUS_CHANGED') return 4
    if (item.type === 'NEW_MESSAGE') return 5
    return 6
}

function renderItem(item: DigestNotificationItem): string {
    const emoji = TYPE_EMOJI[item.type] || '🔔'
    const titleEsc = escapeHtml(item.title)
    const bodyEsc = escapeHtml(truncate(item.body, 100))
    const time = formatRelativePast(item.createdAt)
    return `<tr>
<td style="padding:10px 8px;border-bottom:1px solid ${COLORS.BORDER};font-size:14px;width:30px;text-align:center;vertical-align:top;">${emoji}</td>
<td style="padding:10px 8px;border-bottom:1px solid ${COLORS.BORDER};vertical-align:top;">
<div style="font-weight:600;font-size:13px;color:${COLORS.TEXT_PRIMARY};">${titleEsc}</div>
<div style="font-size:12px;color:${COLORS.TEXT_SECONDARY};margin-top:2px;line-height:1.45;">${bodyEsc}</div>
</td>
<td style="padding:10px 8px;border-bottom:1px solid ${COLORS.BORDER};font-size:11px;color:#9ca3af;white-space:nowrap;text-align:right;vertical-align:top;">${time}</td>
</tr>`
}

function renderSection(title: string, count: number, items: DigestNotificationItem[]): string {
    if (count === 0 || items.length === 0) return ''
    const sorted = [...items].sort((a, b) => priorityRank(a) - priorityRank(b))
    return `<div style="margin-top:24px;">
<div style="font-size:12px;font-weight:700;color:${COLORS.BRAND};text-transform:uppercase;letter-spacing:0.06em;padding:6px 0;border-bottom:2px solid ${COLORS.BRAND}30;margin-bottom:6px;">${title} (${count})</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
<tbody>${sorted.map(renderItem).join('')}</tbody>
</table>
</div>`
}

export async function digestHourly(params: DigestParams): Promise<RenderedEmail> {
    const wsId = params.workspaceId
    const homeLink = wsId ? `${params.appUrl}/${wsId}/dashboard` : params.appUrl

    const previewLine = [
        params.chatCount > 0 ? `${params.chatCount} tin nhắn` : null,
        params.taskCount > 0 ? `${params.taskCount} cập nhật task` : null,
        params.groupCount > 0 ? `${params.groupCount} sự kiện group` : null,
    ].filter(Boolean).join(', ')

    const body = `
${heading('📬', 'Tóm tắt thông báo')}
<div style="color:${COLORS.TEXT_SECONDARY};font-size:13px;margin-bottom:16px;">${escapeHtml(params.timeRange)} · ${escapeHtml(previewLine || 'Không có thông báo mới')}</div>
${renderSection('💬 Chat', params.chatCount, params.chatNotifications)}
${renderSection('📋 Task', params.taskCount, params.taskNotifications)}
${renderSection('👥 Group', params.groupCount, params.groupNotifications)}
${ctaRow([{ text: '🚀 Mở HustlyTasker →', url: homeLink }])}`

    const html = await wrapTemplate({
        bodyHtml: body,
        recipientUserId: params.recipientUserId,
        eventType: 'DIGEST_HOURLY',
        appUrl: params.appUrl,
        workspaceId: params.workspaceId,
    })

    return {
        subject: `📬 Bạn có ${params.totalCount} thông báo mới trên HustlyTasker`,
        html,
    }
}
