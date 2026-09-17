import 'server-only'
import { timingSafeEqual } from 'crypto'

/**
 * [AUDIT SWEEP-2026-07-30 · CRON-TIMING] So sánh bí mật cron theo thời-gian-hằng, dùng chung.
 *
 * Trước đây 6 trên 7 route `/api/cron/*` so bằng `!==`, còn `auth-cleanup` đã làm đúng nhưng giữ
 * helper riêng trong file của nó — nên 6 route kia không có gì để tái dùng. Đây là ĐIỂM NGHẼN: đặt
 * một hàm ở đây rồi import, thay vì bắt từng route tự nhớ (bài học lặp lại của cả chiến dịch:
 * "bắt từng nơi gọi tự nhớ chính là cách lỗ hổng sinh ra").
 *
 * ⚠️ NÓI ĐÚNG MỨC ĐỘ, để người sau không đánh giá sai: đây là PHÒNG THỦ CHIỀU SÂU, không phải lỗ
 * hổng khai thác được. Tôi đã thử dựng đường khai thác và KHÔNG dựng được: để dò secret qua kênh
 * thời gian, kẻ tấn công phải đo chênh lệch của phép so chuỗi JS qua HTTPS + cold start Vercel +
 * jitter mạng — nhiễu lớn hơn tín hiệu vài bậc độ lớn, và Node không cho chênh lệch tuyến tính đáng
 * tin theo từng byte. Rò rỉ thực tế duy nhất lập luận được là ĐỘ DÀI secret, giá trị gần bằng không.
 * Vá vì nó rẻ và vì các route đứng sau có sức phá hoại thật (review-janitor xoá cứng Mux+R2,
 * hard-delete-profiles xoá cascade cả profile) — không vá vì đang bị khai thác.
 */
export function safeEqual(a: string | null | undefined, b: string): boolean {
    if (!a) return false
    const aBuf = Buffer.from(a)
    const bBuf = Buffer.from(b)
    // So độ dài TRƯỚC: `timingSafeEqual` THROW khi hai buffer khác độ dài, nên bỏ bước này là biến
    // một so sánh sai thành lỗi 500. (Đây cũng là chỗ rò độ dài đã nói ở trên — không tránh được nếu
    // muốn dùng timingSafeEqual.)
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
}

/**
 * Đọc khoá cron từ request theo cùng một thứ tự ở mọi route: header `x-cron-secret`, hoặc
 * `Authorization: Bearer <key>`. Gom lại để 7 route không có 7 cách đọc hơi khác nhau.
 *
 * CỐ Ý KHÔNG đọc từ query string — đó chính là lỗ N14 (`/api/test-email`) đã bị xoá ở đợt này: secret
 * trong URL bị ghi vào access log Vercel, lịch sử proxy và header Referer.
 */
export function readCronKey(request: Request): string | null {
    const headerKey = request.headers.get('x-cron-secret')
    if (headerKey) return headerKey
    const authHeader = request.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
    return null
}
