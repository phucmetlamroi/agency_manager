/**
 * Vietnamese date/time formatters for HustlyTasker emails.
 * All formatters target Vietnam timezone (UTC+7).
 */

const VIET_TZ = 'Asia/Ho_Chi_Minh'

function getVietnamParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: VIET_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) {
        if (p.type !== 'literal') map[p.type] = p.value
    }
    return {
        year: map.year || '1970',
        month: map.month || '01',
        day: map.day || '01',
        hour: map.hour || '00',
        minute: map.minute || '00',
    }
}

export function formatVietnamDateTime(date: Date | null | undefined): string {
    if (!date) return ''
    const p = getVietnamParts(date)
    return `${p.day}/${p.month}/${p.year} · ${p.hour}:${p.minute}`
}

export function formatVietnamTime(date: Date): string {
    const p = getVietnamParts(date)
    return `${p.hour}:${p.minute}`
}

export function formatVietnamDate(date: Date): string {
    const p = getVietnamParts(date)
    return `${p.day}/${p.month}/${p.year}`
}

/**
 * "Hôm nay 14:32", "Hôm qua 09:15", "06/05/2026 14:32"
 */
export function formatRelativeVN(date: Date): string {
    const now = new Date()
    const dKey = formatVietnamDate(date)
    const todayKey = formatVietnamDate(now)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayKey = formatVietnamDate(yesterday)
    const time = formatVietnamTime(date)

    if (dKey === todayKey) return `${time} · Hôm nay`
    if (dKey === yesterdayKey) return `${time} · Hôm qua`
    return `${time} · ${dKey}`
}

/**
 * "còn 26 giờ", "còn 45 phút", "còn 2 ngày"
 */
export function formatTimeRemaining(deadline: Date | null | undefined): string {
    if (!deadline) return ''
    const diff = deadline.getTime() - Date.now()
    if (diff <= 0) return 'đã quá hạn'

    const min = Math.floor(diff / 60000)
    if (min < 60) return `còn ${min} phút`

    const hr = Math.floor(min / 60)
    if (hr < 24) return `còn ${hr} giờ`

    const day = Math.floor(hr / 24)
    return `còn ${day} ngày`
}

/**
 * "3 giờ", "1 ngày", "45 phút" (no "còn" prefix — used in overdue context)
 */
export function formatOverdueDuration(deadline: Date): string {
    const diff = Date.now() - deadline.getTime()
    if (diff <= 0) return ''

    const min = Math.floor(diff / 60000)
    if (min < 60) return `${min} phút`

    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} giờ`

    const day = Math.floor(hr / 24)
    return `${day} ngày`
}

/**
 * "vừa xong", "5 phút trước", "2 giờ trước", "3 ngày trước"
 */
export function formatRelativePast(date: Date): string {
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'vừa xong'
    if (min < 60) return `${min} phút trước`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr} giờ trước`
    const day = Math.floor(hr / 24)
    return `${day} ngày trước`
}

export function truncate(str: string | null | undefined, max = 120): string {
    if (!str) return ''
    if (str.length <= max) return str
    return str.slice(0, max).trimEnd() + '...'
}

/**
 * Escape user-provided strings for HTML embedding.
 * Critical for security — all user input must be passed through this before insertion.
 */
export function escapeHtml(str: string | null | undefined): string {
    if (!str) return ''
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/**
 * Highlight @mentions of the recipient in violet bold.
 * Pass recipientUsername to detect "@username" or "@bạn" patterns.
 */
export function highlightMention(text: string, recipientName: string): string {
    const escaped = escapeHtml(text)
    const safeName = recipientName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(@${safeName}|@bạn|@you)`, 'gi')
    return escaped.replace(pattern, '<strong style="color:#7C3AED;">$1</strong>')
}
