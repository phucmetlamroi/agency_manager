import { env } from './env'
import { SignJWT, jwtVerify } from 'jose'

const key = new TextEncoder().encode(env.JWT_SECRET)

// [QĐ-13] Session TTL = 30 ngày. Nguồn chung cho login (auth.ts) + rolling refresh
// (middleware.ts). Cookie server-set httpOnly KHÔNG bị Safari ITP cap 7 ngày.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 2_592_000s

/**
 * [AUDIT SWEEP-2026-07-30 · N8] HẠN TUYỆT ĐỐI của một phiên, tính từ lần ĐĂNG NHẬP THẬT.
 *
 * SESSION_MAX_AGE ở trên là hạn TRƯỢT: middleware ký lại cookie 30 ngày mới mỗi khi token còn dưới
 * 15 ngày, nên một chuỗi JWT bị đánh cắp chỉ cần được dùng để GET một trang bất kỳ mỗi <15 ngày là
 * sống VÔ HẠN. Cổng thu hồi thật (`isSessionLive` so sessionVersion với DB) không chạy ở Edge —
 * middleware không có DB — nên "đăng xuất mọi thiết bị" KHÔNG cắt được vòng gia hạn này.
 *
 * Mốc tuyệt đối cắt vòng đó mà không phá trải nghiệm trượt của QĐ-13: 90 ngày (quyết định của chủ
 * dự án 2026-07-30 — người dùng hoạt động liên tục đăng nhập lại 4 lần/năm).
 * Token cũ không có claim `authAt` ⇒ coi như 0 ⇒ không được gia hạn ⇒ tự rụng trong ≤30 ngày.
 */
export const SESSION_ABSOLUTE_MAX_AGE = 60 * 60 * 24 * 90 // 7_776_000s

/**
 * Sign a JWT with HS256.
 *
 * @param payload Object to sign (typically `{ user, expires }`).
 * @param ttl Optional TTL string (e.g. "1 week", "30 days"). Default: "1 week".
 */
export async function encrypt(payload: any, ttl: string = '1 week') {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(ttl)
        .sign(key)
}

export async function decrypt(input: string): Promise<any> {
    const { payload } = await jwtVerify(input, key, {
        algorithms: ['HS256'],
    })
    return payload
}
