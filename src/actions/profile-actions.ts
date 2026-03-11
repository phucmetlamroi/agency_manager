'use server'

import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { hash, compare } from 'bcryptjs'
import { redirect } from 'next/navigation'
import { UserRole } from '@prisma/client'

export async function checkProfileAccess(profileId: string) {
    const session = await getSession()
    if (!session?.user) return { success: false, error: 'Unauthorized' }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) return { success: false, error: 'User not found' }

    if (user.username === 'admin') {
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

    // For Super Admin ('admin' username), fetch all profiles + member counts
    if (user.username === 'admin') {
        return prisma.profile.findMany({
            include: {
                _count: {
                    select: { users: true, workspaces: true }
                }
            },
            orderBy: { createdAt: 'asc' }
        })
    }

    // For any other user (including other ADMINs), fetch only their linked profile
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

export async function updateProfile(userId: string, data: {
    nickname?: string
    phoneNumber?: string
    email?: string
    avatar?: string // Placeholder for future
}, workspaceId: string) {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                nickname: data.nickname || null,
                phoneNumber: data.phoneNumber || null,
                email: data.email || null,
                // avatar: data.avatar 
            }
        })

        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/dashboard/profile`)
        revalidatePath(`/${workspaceId}/admin/users`) // Admin needs to see new nicknames

        return { success: true }
    } catch (error) {
        console.error('Update profile error:', error)
        return { error: 'Failed to update profile' }
    }
}

export async function changePassword(userId: string, currentPass: string, newPass: string, workspaceId: string) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            return { error: 'User not found' }
        }

        // Verify old password
        const isValid = await compare(currentPass, user.password)
        if (!isValid) {
            return { error: 'Mật khẩu hiện tại không đúng' }
        }

        // Hash new password
        const hashedPassword = await hash(newPass, 12)

        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                // If we want to clear plainPassword for security after user changes it manually:
                plainPassword: null
            }
        })

        revalidatePath(`/${workspaceId}/dashboard/profile`)
        revalidatePath(`/${workspaceId}/admin/users`)

        return { success: true }
    } catch (error) {
        return { error: 'Failed to change password' }
    }
}
