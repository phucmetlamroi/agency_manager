import { cookies } from 'next/headers'
import { encrypt, decrypt } from './jwt'

export async function login(userData: any) {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const session = await encrypt({ user: userData, expires })

    const cookieStore = await cookies()
    cookieStore.set('session', session, {
        expires,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    })
}

export async function loginWithProfile(userData: any, profileId: string) {
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const session = await encrypt({
        user: { ...userData, sessionProfileId: profileId },
        expires,
    })

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
    
    // Create new fake session
    const impersonatedSessionStr = await encrypt({ 
        user: { ...targetUser, isImpersonating: true, originalAdminId: originalUser.id }, 
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
