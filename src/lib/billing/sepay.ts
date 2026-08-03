// [BILLING P3] Cấu hình SePay — MỘT chỗ đọc env cho cả action (tạo QR) lẫn webhook (soát key).
//
// SePay không giữ tiền hộ: nó chỉ NHÌN tài khoản ngân hàng của owner và bắn webhook khi có
// tiền vào. Ba biến, owner đặt trên Vercel + dashboard SePay (docs/billing/VAN-HANH.md):
//   SEPAY_ACCOUNT_NUMBER — số tài khoản nhận tiền
//   SEPAY_BANK           — tên ngân hàng theo chuẩn SePay/VietQR (vd "MBBank", "ACB")
//   SEPAY_WEBHOOK_API_KEY— chuỗi bí mật; dashboard SePay gửi kèm "Authorization: Apikey <key>"
import 'server-only'

export interface SepayConfig {
    accountNumber: string
    bank: string
    webhookApiKey: string
}

/** null khi thiếu biến — nơi gọi tự quyết fail thế nào (trang billing báo "chưa cấu hình",
 *  webhook trả 500 để SePay retry sau khi owner đặt xong biến). */
export function getSepayConfig(): SepayConfig | null {
    const accountNumber = process.env.SEPAY_ACCOUNT_NUMBER
    const bank = process.env.SEPAY_BANK
    const webhookApiKey = process.env.SEPAY_WEBHOOK_API_KEY
    if (!accountNumber || !bank || !webhookApiKey) return null
    return { accountNumber, bank, webhookApiKey }
}

/** Ảnh VietQR do SePay dựng — quét là ra đúng số tiền + nội dung (mã đơn), khách khỏi gõ tay.
 *  Host qr.sepay.vn phải nằm trong img-src CSP (next.config.ts) — thêm ở BILL-P4. */
export function buildSepayQrUrl(cfg: Pick<SepayConfig, 'accountNumber' | 'bank'>, amountVND: number, paymentCode: string): string {
    const q = new URLSearchParams({
        acc: cfg.accountNumber,
        bank: cfg.bank,
        amount: String(amountVND),
        des: paymentCode,
    })
    return `https://qr.sepay.vn/img?${q.toString()}`
}

/** Payload webhook SePay (tài liệu SePay, các trường hệ thống này dùng). SePay không ký
 *  timestamp — chống phát lại nằm ở unique [provider, providerTxnId], không phải ở đây. */
export interface SepayWebhookPayload {
    id: number | string // mã giao dịch phía SePay — thành providerTxnId
    gateway: string // tên ngân hàng
    transactionDate: string // "2026-08-03 10:15:00"
    accountNumber: string
    code: string | null // mã SePay tự tách từ nội dung CK (nhờ tiền tố VELOX cố định)
    content: string | null // nội dung CK nguyên văn
    transferType: 'in' | 'out'
    transferAmount: number
    accumulated?: number
    subAccount?: string | null
    referenceCode?: string | null
    description?: string | null
}
