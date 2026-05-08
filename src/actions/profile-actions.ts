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

/**
 * Create a brand-new Profile for the current user.
 *
 * Use case: any authenticated user can create a Profile (Team) for themselves.
 * They become the OWNER (via ProfileAccess) — first member with elevated privileges.
 *
 * Differs from admin-profile-actions.ts createProfile which requires super-admin.
 *
 * Rate limit: max 5 profiles created per user (prevent abuse).
 */
export async function createProfileForUser(name: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Bạn cần đăng nhập' }
    }

    const trimmed = name?.trim()
    if (!trimmed) return { error: 'Tên profile không được để trống' }
    if (trimmed.length > 50) return { error: 'Tên profile không được quá 50 ký tự' }
    if (trimmed.length < 2) return { error: 'Tên profile phải có ít nhất 2 ký tự' }

    // Rate limit — max 5 profiles per user
    const ownedAccessCount = await prisma.profileAccess.count({
        where: { userId: session.user.id },
    })
    const ownedDirectCount = await prisma.profile.count({
        where: { users: { some: { id: session.user.id } } },
    })
    if (ownedAccessCount + ownedDirectCount >= 5) {
        return { error: 'Đã đạt giới hạn 5 profile/user. Hãy xoá profile cũ trước.' }
    }

    try {
        const newProfile = await prisma.$transaction(async (tx) => {
            const profile = await tx.profile.create({
                data: { name: trimmed },
            })
            // Grant access — user can switch to this profile
            await tx.profileAccess.create({
                data: { userId: session.user.id, profileId: profile.id },
            })
            return profile
        })

        revalidatePath('/', 'layout')
        return { success: true, profile: { id: newProfile.id, name: newProfile.name } }
    } catch (e: any) {
        console.error('createProfileForUser error:', e)
        return { error: 'Không thể tạo profile. Vui lòng thử lại.' }
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
