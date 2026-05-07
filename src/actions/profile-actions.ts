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

    // Kiểm tra xem User có được cấp quyền Du Học vào Profile này không
    const hasAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: user.id, profileId } }
    })
    
    if (hasAccess) {
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

    // For any other user, fetch their home profile + any profiles they have cross-team access to
    const accessibleProfiles = []

    if (user.profileId) {
        const homeProfile = await prisma.profile.findFirst({
            where: { id: user.profileId },
            include: { _count: { select: { users: true, workspaces: true } } }
        })
        if (homeProfile) accessibleProfiles.push(homeProfile)
    }

    const crossTeamAccesses = await prisma.profileAccess.findMany({
        where: { userId: user.id },
        include: {
            profile: {
                include: { _count: { select: { users: true, workspaces: true } } }
            }
        }
    })

    crossTeamAccesses.forEach((acc: any) => {
        if (acc.profile) accessibleProfiles.push(acc.profile)
    })

    return accessibleProfiles

    return []
}

/**
 * Returns the user's accessible profiles AND workspaces for the current profile.
 * Used by the sidebar ProfileWorkspaceSwitcher component.
 */
export async function getMyProfilesAndWorkspaces() {
    const session = await getSession()
    if (!session?.user) return { profiles: [], workspaces: [], currentProfileId: null }

    const currentProfileId: string | null = (session.user as any).sessionProfileId || null

    // Fetch accessible profiles
    const profiles = await getAvailableProfiles()

    // Fetch workspaces for the current profile
    let workspaces: { id: string; name: string; description: string | null }[] = []
    if (currentProfileId) {
        workspaces = await prisma.workspace.findMany({
            where: { profileId: currentProfileId },
            select: { id: true, name: true, description: true },
            orderBy: { createdAt: 'asc' }
        })
    }

    return {
        profiles: profiles.map((p: any) => ({
            id: p.id,
            name: p.name,
            userCount: p._count?.users ?? 0,
            workspaceCount: p._count?.workspaces ?? 0,
        })),
        workspaces,
        currentProfileId,
    }
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
                password: hashedPassword
            }
        })

        revalidatePath(`/${workspaceId}/dashboard/profile`)
        revalidatePath(`/${workspaceId}/admin/users`)

        return { success: true }
    } catch (error) {
        return { error: 'Failed to change password' }
    }
}
