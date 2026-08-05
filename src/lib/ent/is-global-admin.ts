// [Giải trí] Chủ hệ thống có phải đang đăng nhập không?
//
// Dùng cho MÀN NHẬP MÃ: chủ hệ thống là người DUY NHẤT tạo được mã, nên phải cho
// họ thấy lối vào trang tạo mã — nếu không thì lần chạy đầu tiên là bế tắc
// (cần mã để thấy đường tới nơi tạo mã).

import { verifyActiveSession } from '@/lib/security'

export async function isEntCodeManager(): Promise<boolean> {
    try {
        const { status, dbUser } = await verifyActiveSession()
        return status === 'active' && dbUser?.role === 'ADMIN'
    } catch {
        return false
    }
}
