// [BILLING P4b] Xác minh chữ ký HMAC-SHA256 của webhook SePay — LOGIC THUẦN.
//
// KHÔNG 'server-only', KHÔNG import '@/lib/db' — để scripts/billing/test-sepay-hmac.ts
// import được qua đường dẫn tương đối và test không cần dev server (cùng lý do derive.ts).
//
// Hợp đồng (developer.sepay.vn/vi/sepay-webhooks/xac-thuc):
//   • SePay ký chuỗi `${timestamp}.${rawBody}` bằng HMAC-SHA256 với Secret Key sinh ra
//     lúc tạo webhook trên dashboard (chỉ hiện MỘT LẦN — sau đó chỉ còn ****4-ký-tự-cuối).
//   • Header:  X-SePay-Signature: sha256=<64 ký tự hex>   +   X-SePay-Timestamp: Unix giây.
//   • PHẢI ký trên raw body đúng từng byte — parse JSON rồi stringify lại là lệch chữ ký.
//
// Khác API Key, chữ ký kèm timestamp nên chống được PHÁT LẠI ở tầng vận chuyển: lệch quá
// ±TOLERANCE giây là từ chối. Mỗi lần SePay retry đều ký lại với timestamp mới nên retry
// hợp lệ không bao giờ bị khoá nhầm; còn chống trùng GIAO DỊCH vẫn là unique
// [provider, providerTxnId] trên SubscriptionPayment như cũ (hai lớp độc lập).

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SEPAY_HMAC_TOLERANCE_SECONDS = 300

function safeEqualUtf8(a: string, b: string): boolean {
    const ba = Buffer.from(a, 'utf8')
    const bb = Buffer.from(b, 'utf8')
    if (ba.length !== bb.length) return false
    return timingSafeEqual(ba, bb)
}

/** true khi chữ ký hợp lệ. nowMs truyền vào (không gọi Date.now() bên trong) để test được. */
export function verifySepayHmac(
    rawBody: string,
    signatureHeader: string | null,
    timestampHeader: string | null,
    secret: string,
    nowMs: number,
): boolean {
    // HMAC với key rỗng là thứ ai cũng tính được — hàm này export thuần, phải tự vệ
    // chứ không dựa vào việc getSepayConfig đã map env rỗng thành null.
    if (!secret) return false
    if (!signatureHeader || !timestampHeader) return false

    const m = /^sha256=([0-9a-fA-F]{64})$/.exec(signatureHeader.trim())
    if (!m) return false

    const tsRaw = timestampHeader.trim()
    const ts = Number(tsRaw)
    if (!Number.isInteger(ts) || ts <= 0) return false
    if (Math.abs(Math.floor(nowMs / 1000) - ts) > SEPAY_HMAC_TOLERANCE_SECONDS) return false

    // Ký đúng chuỗi header gửi lên (tsRaw), không phải số đã parse — tránh lệch "07" vs "7".
    const expected = createHmac('sha256', secret).update(`${tsRaw}.${rawBody}`, 'utf8').digest('hex')
    return safeEqualUtf8(expected, m[1].toLowerCase())
}
