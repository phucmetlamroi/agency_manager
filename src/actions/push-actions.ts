'use server'

/**
 * [Trial P3] Session-gated Web Push subscription management. The browser calls
 * these after the user grants notification permission. All are no-ops / return
 * null when VAPID isn't configured, so the client toggle simply never appears.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { isWebPushConfigured } from '@/lib/web-push'

/** The VAPID public key the browser needs to subscribe — null = feature off. */
export async function getVapidPublicKey(): Promise<string | null> {
    return isWebPushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null) : null
}

export async function savePushSubscription(sub: {
    endpoint: string
    keys: { p256dh: string; auth: string }
    userAgent?: string
}): Promise<{ success?: boolean; error?: string }> {
    if (!isWebPushConfigured()) return { error: 'off' }
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId) return { error: 'Bạn cần đăng nhập.' }
    // [AUDIT HT-033 fix] getSession() không đọc DB nên không thấy tài khoản đã bị khoá / phiên đã
    // thu hồi. Đăng ký push là đường GHI tạo một kênh đẩy BỀN tới thiết bị: nếu không chặn, người
    // vừa bị khoá vẫn tự cắm thêm thiết bị nhận thông báo và tiếp tục nhận nội dung nội bộ.
    const { isSessionLive } = await import('@/lib/profile-permissions')
    if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }

    const endpoint = (sub?.endpoint || '').trim()
    const p256dh = (sub?.keys?.p256dh || '').trim()
    const auth = (sub?.keys?.auth || '').trim()
    if (!endpoint || !p256dh || !auth) return { error: 'Thiếu thông tin đăng ký.' }
    if (endpoint.length > 1000) return { error: 'Endpoint không hợp lệ.' }

    // Upsert on the unique endpoint — re-subscribing on the same browser (or a
    // subscription that moved to another user) rebinds cleanly.
    try {
        await prisma.pushSubscription.upsert({
            where: { endpoint },
            create: { userId, endpoint, p256dh, auth, userAgent: sub.userAgent?.slice(0, 300) || null },
            update: { userId, p256dh, auth, userAgent: sub.userAgent?.slice(0, 300) || null },
        })
    } catch (e) {
        console.error('[push] save failed', e)
        return { error: 'Không lưu được đăng ký thông báo.' }
    }
    return { success: true }
}

/**
 * [AUDIT HT-033 fix — CỐ Ý KHÔNG GÁC LIVENESS Ở ĐÂY]
 *
 * Finding liệt kê cả hàm này, nhưng gác nó lại làm hệ thống KÉM an toàn hơn: đây là đường GỠ một
 * kênh đẩy thông báo. Chặn tài khoản đã bị khoá gỡ đăng ký nghĩa là thiết bị của họ vẫn tiếp tục
 * nhận thông báo nội bộ được đẩy tới. Xoá vốn đã bị giới hạn theo `userId` của chính người gọi
 * (không gỡ được của người khác), nên chiều tấn công duy nhất là tự gỡ của mình — vô hại.
 * Nguyên tắc: chốt liveness gác đường TẠO/MỞ RỘNG quyền, không gác đường THU HẸP quyền.
 */
export async function deletePushSubscription(endpoint: string): Promise<{ success?: boolean }> {
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId || !endpoint) return { success: true }
    // Scope the delete to the caller so a token can't unsubscribe someone else.
    try { await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } }) } catch { /* best-effort */ }
    return { success: true }
}
