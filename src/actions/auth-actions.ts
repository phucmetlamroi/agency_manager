'use server'

import { prisma } from '@/lib/db'
import { login, logout, loginWithProfile } from '@/lib/auth'
import { compare } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { cookies, headers } from 'next/headers'
import { rateLimit } from '@/lib/rate-limit'
import { UserRole } from '@prisma/client'

export async function loginAction(prevState: any, formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    if (!username || !password) {
        return { error: 'Please enter all required information' }
    }

    try {
        const headersList = await headers()
        const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown-ip'
        
        // 5 requests per 60 seconds allowed per IP for login to prevent brute force
        const rl = await rateLimit(`login_${ip}`, 5, 60 * 1000)
        
        if (!rl.success) {
            console.warn(`[SECURITY] Rate Limit Triggered for IP: ${ip} on username: ${username}`)
            return { error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút.' }
        }
    } catch (e) {
        // Skip rate limiting if headers() throws (during build time or unsupported edge case)
    }

    console.log(`[Login] Attempt for user: ${username}`)

    let role: string = 'USER'

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        })

        if (!user) {
            console.log(`[Login] User not found: ${username}`)
            return { error: 'Account does not exist' }
        }

        const isValid = await compare(password, user.password)

        if (!isValid) {
            console.log(`[Login] Invalid password for: ${username}`)
            return { error: 'Incorrect password' }
        }

        role = user.role
        console.log(`[Login] Success for: ${username}, role: ${role}`)

        // CLIENT role → portal flow (unchanged)
        if (role === 'CLIENT') {
            await login({
                id: user.id, username: user.username, role: user.role,
                profileId: user.profileId
            })
            const cookieStore = await cookies()
            cookieStore.set('NEXT_LOCALE', 'en', { path: '/' })
            redirect('/portal/en')
        }

        // Staff/Admin: auto-select profile + most recent workspace → dashboard
        let defaultProfileId = user.profileId

        if (!defaultProfileId) {
            const crossAccess = await prisma.profileAccess.findFirst({
                where: { userId: user.id },
                select: { profileId: true }
            })
            defaultProfileId = crossAccess?.profileId ?? null
        }

        if (!defaultProfileId) {
            await login({
                id: user.id, username: user.username, role: user.role,
                profileId: user.profileId
            })
            console.log(`[Login] No profile found for ${username}, fallback to /login`)
            redirect('/login')
        }

        await loginWithProfile({
            id: user.id, username: user.username, role: user.role,
            profileId: user.profileId
        }, defaultProfileId)
        console.log(`[Login] Cookie set with profileId=${defaultProfileId} for: ${username}`)

        const firstWs = await prisma.workspace.findFirst({
            where: { profileId: defaultProfileId },
            orderBy: { createdAt: 'desc' },
        })

        if (!firstWs) {
            console.log(`[Login] No workspace for profile ${defaultProfileId}, fallback to /login`)
            redirect('/login')
        }

        console.log(`[Login] Auto-redirect to workspace ${firstWs.id} for: ${username}`)
        redirect(`/${firstWs.id}/admin`)

    } catch (err) {
        if (err instanceof Error && err.message === 'NEXT_REDIRECT') throw err
        console.error('[Login] ERROR:', err)
        return { error: `Lỗi: ${err instanceof Error ? err.message : 'Unknown'}` }
    }
}

export async function logoutAction() {
    await logout()
    redirect('/login')
}
