import { cookies } from 'next/headers'
import { encrypt, decrypt } from './jwt'

const DEFAULT_SESSION_DAYS = 7
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
    const session = await encrypt({ user: userData, expires }, ttl)

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
        user: { ...userData, sessionProfileId: profileId },
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

export async function logout() {
    const cookieStore = await cookies()
    cookieStore.set('session', '', { expires: new Date(0) })
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

    // Keep the original admin session safe
    const originalSessionStr = await encrypt({ user: originalUser, expires })

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
    })

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
