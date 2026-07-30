import { cookies } from 'next/headers'
import { encrypt, decrypt } from './jwt'

// [QĐ-13] Phiên mặc định 30 ngày (trước là 7 → hết hạn giữa phiên trên mobile, văng ra
// login mất ngữ cảnh). Rolling refresh trong middleware giữ phiên sống khi user còn hoạt động.
const DEFAULT_SESSION_DAYS = 30
const REMEMBER_ME_DAYS = 30

/**
 * Tạo session cookie cơ bản. KHÔNG embed profileId — dùng cho user mới signup
 * chưa active workspace, hoặc CLIENT role.
 *
 * @param userData User payload bao gồm sessionVersion, restricted, requiresEmailMigration claims.
 * @param opts.rememberMe Nếu true → cookie TTL 30d thay vì 7d.
 */
export async function login(userData: any, opts?: { rememberMe?: boolean }) {
    const days = opts?.rememberMe ? REMEMBER_ME_DAYS : DEFAULT_SESSION_DAYS
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const ttl = `${days} days`
    // [AUDIT SWEEP-2026-07-30 · N8] `authAt` = mốc ĐĂNG NHẬP THẬT, không bị rolling-refresh dịch đi.
    // middleware dùng nó để từ chối gia hạn quá SESSION_ABSOLUTE_MAX_AGE (xem lib/jwt.ts).
    const session = await encrypt({ user: { ...userData, authAt: Date.now() }, expires }, ttl)

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })
}

export async function loginWithProfile(userData: any, profileId: string, opts?: { rememberMe?: boolean }) {
    const days = opts?.rememberMe ? REMEMBER_ME_DAYS : DEFAULT_SESSION_DAYS
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    const ttl = `${days} days`
    const session = await encrypt({
        // [AUDIT SWEEP-2026-07-30 · N8] `authAt` — xem chú thích ở login() và lib/jwt.ts.
        user: { ...userData, sessionProfileId: profileId, authAt: Date.now() },
        expires,
    }, ttl)

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })
}

/**
 * Xoá cookie phiên của TRÌNH DUYỆT NÀY. Chỉ vậy thôi.
 *
 * ⚠️ Hàm này KHÔNG thu hồi token. Ai đang cầm một bản sao chuỗi JWT vẫn dùng được cho tới khi
 * nó hết hạn — xoá cookie chỉ làm trình duyệt quên nó đi, chứ máy chủ vẫn nhận.
 *
 * ⚠️ ĐỪNG dùng hàm này làm đường đăng xuất cho người dùng. Đó chính là lỗ HT-018: ba layout từng
 * gọi thẳng nó cho nút "Đăng xuất" trên di động, nên bấm nút đó chẳng thu hồi được gì. Mọi lối
 * đăng xuất — desktop lẫn mobile — nay đi qua GET /api/auth/logout, nơi có đủ ghi nhật ký,
 * thu hồi token, rồi mới xoá cookie.
 *
 * Hàm này chỉ còn là bước cuối BÊN TRONG đường đó.
 */
export async function logout() {
    const cookieStore = await cookies()
    cookieStore.set('session', '', { expires: new Date(0) })
}

/**
 * [AUDIT HT-018] Thu hồi MỌI token đang sống của một người dùng, bằng cách tăng
 * `User.sessionVersion` — token cũ mang version thấp hơn sẽ bị `isSessionLive` và
 * `verifyActiveSession` từ chối ngay lần dùng kế tiếp.
 *
 * VÌ SAO CẦN: hệ thống dùng JWT không trạng thái, không có bảng phiên để xoá từng cái. Nên
 * "đăng xuất" mà chỉ xoá cookie là không đụng gì tới bản sao token kẻ tấn công đang giữ — đúng
 * tình huống người dùng bấm đăng xuất VÌ nghi máy bị xâm nhập, và thao tác đó chẳng làm được gì.
 *
 * HỆ QUẢ CÓ CHỦ Ý: tăng version giết TẤT CẢ phiên, không riêng thiết bị hiện tại. Đó là cái giá
 * bắt buộc của mô hình JWT không trạng thái — muốn thu hồi từng thiết bị thì phải có bảng phiên,
 * là một thay đổi kiến trúc khác hẳn.
 *
 * Không bao giờ ném lỗi (đăng xuất không được phép thất bại vì DB), nhưng TRẢ VỀ false khi
 * hỏng để nơi gọi còn ghi log được.
 */
export async function revokeAllSessions(userId: string | undefined | null): Promise<boolean> {
    if (!userId) return false
    try {
        const { prisma } = await import('@/lib/db')
        await prisma.user.update({
            where: { id: userId },
            data: { sessionVersion: { increment: 1 } },
        })
        return true
    } catch (e) {
        // Không ném — đăng xuất không được phép thất bại vì DB trục trặc. Nhưng PHẢI trả false và
        // ghi log: nuốt lỗi im lặng ở đây nghĩa là người dùng được báo "đã đăng xuất" trong khi
        // token vẫn sống, và không ai điều tra được về sau.
        console.error('[SECURITY] revokeAllSessions failed:', e)
        return false
    }
}

/**
 * Trả về JWT payload đã decrypt (KHÔNG check sessionVersion ở đây — giữ async-cheap
 * cho middleware Edge runtime). Defense-in-depth check sessionVersion thực hiện ở:
 *   - `verifyActiveSession()` trong src/lib/security.ts (đối với protected pages)
 *   - DAL trong từng Server Action quan trọng
 *
 * Đây là pattern khuyến nghị bởi spec §12 (CVE-2025-29927 mitigation):
 * không trust JWT đơn lẻ; luôn cross-check với DB ở DAL.
 */
export async function getSession() {
    const cookieStore = await cookies()
    const session = cookieStore.get('session')?.value
    if (!session) return null
    try {
        return await decrypt(session)
    } catch (e) {
        return null
    }
}

export async function createImpersonationSession(originalUser: any, targetUser: any) {
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000) // 2 hours for testing session

    // Keep the original admin session safe.
    // [AUDIT HT-019 fix] Pass an explicit 2h TTL so the signed JWT's `exp` matches the 2h
    // window. encrypt() defaults to a 1-WEEK exp, so without this the token stayed valid for a
    // week even though the cookie expires in 2h — a copied token outlived the impersonation.
    const originalSessionStr = await encrypt({ user: originalUser, expires }, '2h')

    // Create impersonated session với expiresAt claim → UI banner countdown
    // (audit finding #2.5: Impersonation TTL không enforce force-logout, không có
    // cảnh báo countdown). Claim này dùng để UI banner hiển thị thời gian còn lại.
    const impersonatedSessionStr = await encrypt({
        user: {
            ...targetUser,
            isImpersonating: true,
            originalAdminId: originalUser.id,
            impersonationExpiresAt: expires.toISOString(),
        },
        expires
    }, '2h') // [AUDIT HT-019 fix] JWT exp = 2h to match the impersonation window (was 1-week default)

    const cookieStore = await cookies()
    
    // Store original session in standby
    cookieStore.set('admin_session', originalSessionStr, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })

    // Overwrite regular session with fake one
    cookieStore.set('session', impersonatedSessionStr, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })
}

export async function stopImpersonationSession() {
    const cookieStore = await cookies()
    const storedAdminSession = cookieStore.get('admin_session')?.value
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Restore normal expiry

    // If we have an admin session saved
    if (storedAdminSession) {
        // Restore to main session
        cookieStore.set('session', storedAdminSession, {
            expires,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        })
    } else {
        // Fallback: clear it to force normal login
        cookieStore.delete('session')
    }

    // Always clear the standby cookie
    cookieStore.delete('admin_session')
}

export { encrypt, decrypt }
