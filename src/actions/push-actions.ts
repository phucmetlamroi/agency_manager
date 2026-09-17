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
    //
    // [AUDIT SWEEP-2026-07-30 fix · N13/PUSH-REBIND] Việc rebind này ĐỔI CHỦ của một kênh đẩy: ai
    // biết `endpoint` của người khác thì gọi hàm này là kênh đó trỏ về mình, và thông báo nội bộ của
    // nạn nhân đi sang thiết bị mình.
    //
    // ⚠️ KHÔNG vá bằng cách bỏ `userId` khỏi nhánh update — như vậy CÒN TỆ HƠN, và đây là lý do
    // chính nhánh này tồn tại: máy dùng chung, A đăng xuất rồi B bật thông báo trên CÙNG trình duyệt
    // ⇒ endpoint không đổi, dòng cũ vẫn trỏ về A ⇒ thông báo nội bộ của A đẩy sang thiết bị B đang
    // dùng. Đó là rò chéo người dùng THẬT, nặng hơn kịch bản cần-biết-endpoint (endpoint là chuỗi bí
    // mật do trình duyệt sinh, không liệt kê được).
    // Vá tối thiểu: GIỮ rebind, nhưng làm nó CÓ VẾT — đọc chủ cũ trước, và ghi audit khi đổi chủ.
    const previousOwner = await prisma.pushSubscription
        .findUnique({ where: { endpoint }, select: { userId: true } })
        .catch(() => null)

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

    // [AUDIT SWEEP-2026-07-30 fix · N13] Đổi chủ kênh đẩy phải để lại vết. Không chặn (xem lý do ở
    // trên), nhưng nếu về sau có tranh chấp "vì sao thông báo của tôi sang máy người khác" thì phải
    // có bản ghi để đối chiếu. Cắt `endpoint` xuống 120 ký tự — nó là chuỗi bí mật, không ghi trọn
    // vào nhật ký. `workspaceId: null` vì đăng ký push là cấp tài khoản, không thuộc workspace nào.
    if (previousOwner && previousOwner.userId !== userId) {
        try {
            const { audit } = await import('@/lib/audit-log')
            await audit({
                workspaceId: null,
                actorUserId: userId,
                action: 'push.subscription_rebound',
                targetType: 'PushSubscription',
                targetId: endpoint.slice(0, 120),
                before: { userId: previousOwner.userId },
                after: { userId },
            })
        } catch { /* best-effort — không chặn việc đăng ký vì nhật ký lỗi */ }
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
 * Nguyên tắc rút ra: chốt liveness gác đường TẠO/MỞ RỘNG quyền; với đường CHỈ thu hẹp quyền của
 * chính mình thì gác lại phản tác dụng.
 * ⚠️ "CHỈ thu hẹp" là điều kiện chặt, không phải khẩu hiệu. `updateMyNotificationPreferences`
 * trông giống trường hợp này (tắt được email) nhưng nó BẬT được nữa, nên vẫn phải gác — người
 * phản biện đã chỉ đúng rằng tôi phát biểu nguyên tắc rộng hơn cái mã thực sự làm. Hệ quả chấp
 * nhận: tài khoản bị khoá không tự tắt được email thông báo. Ghi ra để người sau không lấy dòng
 * này làm cớ mở thêm ngoại lệ.
 */
export async function deletePushSubscription(endpoint: string): Promise<{ success?: boolean }> {
    const session = await getSession()
    const userId = session?.user?.id
    if (!userId || !endpoint) return { success: true }
    // Scope the delete to the caller so a token can't unsubscribe someone else.
    try { await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } }) } catch { /* best-effort */ }
    return { success: true }
}
