/**
 * [kiểm toán 2026-07 · S2-2 / §5.1] Tách "mất mạng" ra khỏi mọi lỗi khác.
 *
 * ─── BỐI CẢNH ──────────────────────────────────────────────────────────────
 * Phát hiện gốc ("bấm nút khi mất mạng thì hệ thống im lặng") đã được ĐO LẠI và
 * RÚT LẠI: phép đo cũ bấm nhầm các nút xử lý tại chỗ (sắp xếp, đổi kiểu hiển
 * thị), vốn không cần mạng. Nút thật sự gọi máy chủ phản hồi sau 0,5 giây.
 *
 * Phần còn thiếu hẹp hơn nhiều, và đây là chỗ vá nó: câu báo lỗi không phân
 * biệt "mạng chết" với "máy chủ từ chối". Hai chuyện đó đòi hai hành động khác
 * hẳn nhau — một bên là kiểm tra lại wifi rồi bấm lại, một bên là bấm lại cũng
 * vô ích. Và ở vài chỗ, câu hiện ra khi mất mạng còn là `e.message` thô, tức
 * "Failed to fetch" — tiếng Anh, của trình duyệt, người dùng không hiểu gì.
 *
 * ─── CÁCH NHẬN BIẾT ────────────────────────────────────────────────────────
 * Hai tín hiệu, chỉ cần một:
 *
 *  1. `navigator.onLine === false` — máy không còn đường ra mạng nào. Chắc
 *     chắn đúng theo chiều này; chiều ngược lại thì KHÔNG (onLine === true chỉ
 *     nghĩa là có card mạng, vẫn có thể nối vào một router đã chết).
 *
 *  2. Lỗi là `TypeError` của tầng fetch. Server action của Next đi bằng fetch;
 *     khi gói tin không tới nơi, trình duyệt ném TypeError với chữ khác nhau
 *     tuỳ hãng — Chrome "Failed to fetch", Firefox "NetworkError when
 *     attempting to fetch resource", Safari "Load failed". Chuỗi so khớp bên
 *     dưới phủ cả ba. Tín hiệu này bắt được ca (2) mà `navigator.onLine` bỏ sót.
 *
 * Lỗi do MÁY CHỦ từ chối (không đủ quyền, sai trạng thái, xung đột phiên bản)
 * không bao giờ là TypeError, nên không lọt vào đây — câu cũ của từng chỗ giữ
 * nguyên. Đó là chủ đích: file này KHÔNG nuốt thông tin, chỉ thay câu ở đúng
 * một trường hợp mà câu cũ vô nghĩa.
 */

/** Câu duy nhất cho trường hợp mất kết nối (đặc tả §5.1). */
export const OFFLINE_MESSAGE = 'Mất kết nối. Thay đổi chưa được lưu.'

/** true khi lần gọi hỏng vì MẠNG, không phải vì máy chủ từ chối. */
export function isNetworkFailure(e: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
    if (e instanceof TypeError) {
        return /fetch|network|connection|load failed/i.test(e.message || '')
    }
    return false
}

/**
 * Câu để hiện cho người dùng. `fallback` là câu vốn có của từng chỗ — nó chỉ
 * bị thay khi (và chỉ khi) nguyên nhân là mạng.
 */
export function failureMessage(e: unknown, fallback: string): string {
    return isNetworkFailure(e) ? OFFLINE_MESSAGE : fallback
}
