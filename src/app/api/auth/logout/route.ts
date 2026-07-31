import { getSession, logout, revokeAllSessions } from '@/lib/auth'
import { isSessionLive } from '@/lib/profile-permissions'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { headers } from 'next/headers'
import { getRequestIpOrNull } from '@/lib/request-ip'

/**
 * GET /api/auth/logout
 *
 * Audit fix #3.8: Logout không log → không trace được "ai logout khi nào".
 * Bug bảo mật nhỏ — nếu account bị compromise, không có dấu vết logout.
 *
 * Sau: log audit event 'auth.logout' với SYSTEM workspaceId trước khi clear cookie.
 */
export async function GET() {
    // Capture session info BEFORE clearing cookie (logout xoá session)
    try {
        const session = await getSession()
        const userId = session?.user?.id
        if (userId) {
            let ip: string | null = null
            let ua: string | null = null
            try {
                const h = await headers()
                // [AUDIT HT-002 fix] Was x-forwarded-for[0] — caller-controlled, so the logout
                // audit row recorded whatever IP the caller typed.
                ip = await getRequestIpOrNull()
                ua = h.get('user-agent')
            } catch { /* edge */ }

            await prisma.auditLog.create({
                data: {
                    workspaceId: 'SYSTEM',
                    actorUserId: userId,
                    userId: userId,
                    action: 'auth.logout',
                    targetType: 'User',
                    targetId: userId,
                    ipAddress: ip,
                    userAgent: ua,
                },
            }).catch(() => { /* non-blocking */ })
        }
    } catch {
        // Non-blocking — logout vẫn phải work even if audit fails
    }

    // [AUDIT HT-018 fix] Đây là đường đăng xuất DUY NHẤT của sản phẩm — desktop (AppSidebar,
    // CommandMenu), mobile (AccountSheet → server action của 3 layout), và các đường đá-ra-ngoài
    // đều dồn về đây. Trước đây nó chỉ xoá cookie, nên bản sao token kẻ tấn công giữ vẫn sống
    // tới khi hết hạn: thao tác "đăng xuất vì nghi bị hack" chẳng thu hồi được gì.
    // [AUDIT HT-018 fix] Bản vá này biến GET thành endpoint GHI DATABASE, nên nó tự đẻ ra một
    // lỗ CSRF mới: cookie `sameSite: 'lax'` VẪN được gửi khi điều hướng top-level từ site khác,
    // nên một thẻ <a> hay <img> trên trang lạ có thể đá nạn nhân khỏi MỌI thiết bị, lặp tuỳ ý.
    // Trước bản vá, lừa click chỉ xoá một cookie — phiền chứ không nguy hiểm.
    // Sec-Fetch-Site do trình duyệt đặt, trang web không giả được. 'none' = gõ thẳng URL/bookmark.
    // Thiếu header (trình duyệt cũ) thì vẫn cho qua để không chặn nhầm người dùng thật.
    let crossSite = false
    try {
        crossSite = (await headers()).get('sec-fetch-site') === 'cross-site'
    } catch { /* ignore */ }

    try {
        if (crossSite) {
            // Vẫn xoá cookie ở dưới (vô hại, và đúng ý nếu người dùng thật sự muốn thoát), nhưng
            // KHÔNG thu hồi — thu hồi là thao tác phá hoại nếu cú bấm không phải của họ.
            console.warn('[SECURITY] logout: cross-site request — bỏ qua bước thu hồi token')
            throw new Error('cross-site')
        }
        const session = await getSession()
        const uid = session?.user?.id

        // Đang ĐÓNG VAI người khác thì tuyệt đối không thu hồi: session.user.id lúc này là id
        // NHÂN VIÊN bị đóng vai, nên thu hồi ở đây sẽ đá một người thật ra khỏi mọi thiết bị của
        // họ, kèm một dòng nhật ký đứng tên họ mà họ không hề làm gì.
        const impersonating = Boolean((session?.user as any)?.isImpersonating)

        // Phiên đã chết sẵn (bị khoá / version cũ) thì không có gì để thu hồi. Không có chốt này
        // thì thiết bị B — bị đá về đây vì phiên lỗi thời sau khi thiết bị A đăng xuất — sẽ bump
        // thêm một lần nữa và đẻ ra một dòng 'auth.logout' giả đứng tên nạn nhân.
        const live = uid ? await isSessionLive(session as any) : false

        if (uid && !impersonating && live) {
            const ok = await revokeAllSessions(uid)
            if (!ok) {
                // Fail-open có chủ ý (không chặn đăng xuất) nhưng PHẢI để lại dấu vết: đây đúng
                // khoảnh khắc người dùng nghi bị xâm nhập, và họ vừa được báo "đã đăng xuất".
                console.error(`[SECURITY] logout: revokeAllSessions FAILED for user ${uid} — token cũ VẪN CÒN HIỆU LỰC`)
            }
        }
    } catch (e) {
        if (!crossSite) console.error('[SECURITY] logout: revoke step threw:', e)
    }

    await logout()
    redirect('/login')
}
