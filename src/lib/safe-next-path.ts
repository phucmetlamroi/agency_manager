/**
 * [AUDIT SWEEP-2026-07-30] Kiểm tra tham số `?next=` sau đăng nhập, chống open-redirect.
 *
 * VÌ SAO NẰM Ở LIB, KHÔNG NẰM TRONG auth-actions.ts:
 * `auth-actions.ts` mở đầu bằng `'use server'`, và trong file như vậy MỌI export đều trở thành một
 * server action gọi được từ ngoài. Muốn có hàng rào hồi quy chạy được (scripts/assert-safe-next-path.ts)
 * thì phải import hàm này — nên nếu để nó ở đó và export, ta vừa tạo thêm một endpoint công khai chỉ
 * để phục vụ việc test. Tách sang module thường là cách duy nhất có cả hai.
 *
 * LỖI ĐÃ VÁ: bộ kiểm tra cũ so khớp trên chuỗi THÔ, còn trình duyệt lại XOÁ TAB/LF/CR khỏi URL trước
 * khi phân giải (WHATWG URL). Nên `?next=/%09/evil.com` decode thành `/<TAB>/evil.com`: bộ kiểm tra
 * thấy "bắt đầu bằng một dấu /, không phải //, không có \" ⇒ cho qua; trình duyệt bỏ TAB rồi thấy
 * `//evil.com` ⇒ điều hướng ra ngoài. Nạn nhân bị đẩy khỏi app NGAY SAU khi đăng nhập thành công
 * thật, referrer là trang login hợp lệ nên gần như không ai nghi ngờ.
 *
 * Nguyên tắc: CHUẨN HOÁ trước khi so khớp, rồi trả về chuỗi ĐÃ CHUẨN HOÁ — không trả chuỗi thô.
 */
export function safeNextPath(raw: unknown): string | null {
    if (typeof raw !== 'string' || !raw) return null

    // Loại mọi ký tự điều khiển C0 + DEL, không chỉ TAB/LF/CR: liệt kê từng ký tự cấm là cách bỏ
    // sót (cùng bài học với danh sách cấm INNGEST_DEV trong đợt vá này).
    let path = ''
    for (const ch of raw) {
        const code = ch.charCodeAt(0)
        if (code >= 0x20 && code !== 0x7f) path += ch
    }
    if (!path) return null

    if (!path.startsWith('/')) return null
    if (path.startsWith('//') || path.startsWith('/\\') || path.includes('\\')) return null
    if (path.startsWith('/api') || path.startsWith('/login')) return null
    return path
}
