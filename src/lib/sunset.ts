// [Web Sunset] HustlyTasker web → Google Sheets. Banner tới ngày cutover, sau đó chặn app.
// Tắt khẩn cấp: đặt SUNSET_ENABLED = false (banner + chặn biến mất ngay).

export const SUNSET_DATE = '2026-07-04' // ngày web ngưng hoạt động (giờ VN)
export const SUNSET_ENABLED = true

/**
 * Phase hiển thị, tính theo giờ Việt Nam:
 *   'off'     — tính năng tắt (SUNSET_ENABLED=false)
 *   'banner'  — trước ngày cutover: hiện banner thông báo
 *   'blocked' — từ ngày cutover trở đi: chặn vào app (maintenance)
 */
export function sunsetPhase(now: Date = new Date()): 'off' | 'banner' | 'blocked' {
    if (!SUNSET_ENABLED) return 'off'
    const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
    const cutover = new Date(`${SUNSET_DATE}T00:00:00+07:00`)
    return vnNow.getTime() >= cutover.getTime() ? 'blocked' : 'banner'
}

/** "04/07/2026" cho hiển thị. */
export const SUNSET_DATE_VN = SUNSET_DATE.split('-').reverse().join('/')
