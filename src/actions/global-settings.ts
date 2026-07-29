'use server'

import { prisma } from '@/lib/db'
import { verifyActiveSession } from '@/lib/security'

const GLOBAL_FRAME_TASK_ID = 'global-system-settings'

/**
 * [AUDIT HT-022 fix, vòng 3] Ai được chạm vào credential Frame.io DÙNG CHUNG.
 *
 * Hai vòng trước đều thất bại vì cùng một lý do, và lý do đó đáng ghi lại: KHÔNG CÓ CỜ NÀO
 * TRONG DATABASE mà một người tự đăng ký không với tới được.
 *   · vòng 1 — "OWNER/ADMIN của bất kỳ workspace nào": signup tự tạo workspace và tự phong OWNER.
 *   · vòng 2 — "isTreasurer": vẫn tự cấp được qua chuỗi 4 bước, toàn bằng server action công khai —
 *     đăng ký → createUser đúc tài khoản thứ hai TRONG CHÍNH profile mình (mật khẩu do mình đặt) →
 *     inviteToWorkspace, cùng profile nên thêm thẳng không cần Accept → toggleTreasurer bật cờ
 *     TOÀN CỤC cho tài khoản đó → đăng nhập bằng nó.
 * Chốt "không được tự toggle cho mình" chỉ buộc kẻ tấn công dùng hai tài khoản, mà bước 2 đúc tài
 * khoản thứ hai miễn phí.
 *
 * Nên thẩm quyền phải đến từ ngoài DB. Danh sách dưới đây đọc từ biến môi trường, thứ mà không
 * server action nào ghi được. Bỏ trống = KHÔNG AI đọc được (fail-closed) — đúng ý muốn, vì tích
 * hợp Frame.io đã bị module review thay thế và hàm này hiện không có caller nào trong repo.
 */
function isFrameOperator(email: string | null | undefined): boolean {
    const raw = process.env.FRAME_ACCOUNT_OPERATORS
    if (!raw || !email) return false
    const allow = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    if (!allow.length) return false
    return allow.includes(email.trim().toLowerCase())
}

export async function getFrameAccount() {
    // [AUDIT R1 — BLOCKER fix] These were unauthenticated server actions exposing a
    // shared credential to anyone. Require an authenticated, active (non-locked)
    // session before reading/writing the global Frame account.
    const sess = await verifyActiveSession()
    if (sess.status !== 'active') {
        return { account: '', password: '' }
    }
    // [AUDIT HT-022 fix] Xem isFrameOperator ở đầu file: thẩm quyền phải đến từ biến môi trường,
    // vì mọi vai trong DB đều tự cấp được từ luồng đăng ký công khai.
    if (!isFrameOperator(sess.dbUser?.email)) {
        return { account: '', password: '' }
    }
    try {
        const frameTask = await prisma.task.findUnique({
            where: { id: GLOBAL_FRAME_TASK_ID }
        })

        if (!frameTask || !frameTask.notes_vi) {
            return { account: '', password: '' }
        }

        try {
            const data = JSON.parse(frameTask.notes_vi)
            return {
                account: data.account || '',
                password: data.password || ''
            }
        } catch (e) {
            // If it's not valid JSON, just return empty
            return { account: '', password: '' }
        }
    } catch (e) {
        console.error("Failed to get frame account:", e)
        return { account: '', password: '' }
    }
}

export async function updateFrameAccount(account: string, password: string) {
    // [AUDIT R1 — BLOCKER fix] Require an authenticated, active session before
    // overwriting the global shared credential.
    const sess = await verifyActiveSession()
    if (sess.status !== 'active') {
        return { error: 'Bạn cần đăng nhập.' }
    }
    // [AUDIT HT-022 fix] Bản mô tả finding giả định hàm GHI này đã có phân quyền ("scope theo
    // workspace ADMIN như updateFrameAccount") — nó KHÔNG có. Chỉ cần đăng nhập là ghi đè được
    // credential dùng chung của cả hệ thống. Khoá đường ghi bằng đúng cổng của đường đọc: khoá
    // một bên mà để hở bên kia thì kẻ tấn công chỉ cần ghi giá trị của mình vào rồi đọc lại.
    if (!isFrameOperator(sess.dbUser?.email)) {
        return { error: 'Bạn không có quyền thay đổi cài đặt dùng chung.' }
    }
    try {
        const payload = JSON.stringify({ account, password })

        await prisma.task.upsert({
            where: { id: GLOBAL_FRAME_TASK_ID },
            update: {
                notes_vi: payload
            },
            create: {
                id: GLOBAL_FRAME_TASK_ID,
                title: 'SYSTEM: GLOBAL SETTINGS',
                type: 'SYSTEM',
                status: 'HIDDEN',
                notes_vi: payload,
                workspaceId: null // Crucial: Don't link it to any workspace
            }
        })

        return { success: true }
    } catch (e) {
        console.error("Failed to update frame account:", e)
        return { error: "Failed to update global settings." }
    }
}
