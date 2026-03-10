'use server'

import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'

export async function checkProfileAccess(profileId: string) {
    const session = await getSession()
    if (!session?.user) return { success: false, error: 'Unauthorized' }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) return { success: false, error: 'User not found' }

    if (user.role === 'ADMIN') {
        return { success: true }
    }

    if (user.profileId === profileId) {
        return { success: true }
    }

    return { success: false, error: 'Bạn không có quyền truy cập vào Team này. Vui lòng liên hệ Admin tối thượng.' }
}

export async function selectProfile(profileId: string) {
    const access = await checkProfileAccess(profileId)
    if (!access.success) {
        return access
    }

    const cookieStore = await cookies()
    cookieStore.set('current_profile_id', profileId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    })

    return { success: true }
}

export async function getAvailableProfiles() {
    const session = await getSession()
    if (!session?.user) return []

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) return []

    // For Super Admin/Admin, fetch all profiles + member counts
    if (user.role === 'ADMIN') {
        return prisma.profile.findMany({
            include: {
                _count: {
                    select: { users: true, workspaces: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        })
    }

    // For User/Client, fetch only their linked profile
    if (user.profileId) {
        return prisma.profile.findMany({
            where: { id: user.profileId },
            include: {
                _count: {
                    select: { users: true, workspaces: true }
                }
            }
        })
    }

    return []
}
