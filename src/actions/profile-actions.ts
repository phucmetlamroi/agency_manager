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

    // [Sprint Z] Super admin bypass removed. Access via ProfileAccess row only.
    // Note: User.profileId không còn auto-grant access vì migration đã tạo
    // ProfileAccess(role=OWNER) cho creator của mỗi profile.
    const hasAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: user.id, profileId } }
    })

    if (hasAccess) {
        return { success: true }
    }

    return { success: false, error: 'Bạn không có quyền truy cập vào Profile này.' }
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

    // [Sprint Z] Super admin bypass removed. All users go through ProfileAccess
    // table. Migration tạo ProfileAccess(role=OWNER) cho creator + ProfileAccess(role=USER)
    // cho cross-team grants → unified path.
    const accessibleProfiles: any[] = []

    const profileAccesses = await prisma.profileAccess.findMany({
        where: { userId: user.id },
        include: {
            profile: {
                include: { _count: { select: { users: true, workspaces: true } } }
            }
        }
    })

    profileAccesses.forEach((acc: any) => {
        if (acc.profile) accessibleProfiles.push(acc.profile)
    })

    return accessibleProfiles
}

/**
 * Returns the user's accessible profiles AND workspaces for the current profile.
 * Used by the sidebar ProfileWorkspaceSwitcher component.
 *
 * [Sprint Z] Each profile object includes `currentRole: ProfileRole | null`
 * (OWNER/ADMIN/USER) from ProfileAccess.role. Workspace list is SCOPED:
 *   - OWNER: thấy tất cả workspaces của profile
 *   - ADMIN: workspaces createdAt >= grantedAt + những workspace có explicit WorkspaceMember
 *   - USER: chỉ workspaces có explicit WorkspaceMember
 */
export async function getMyProfilesAndWorkspaces() {
    const session = await getSession()
    if (!session?.user) return { profiles: [], workspaces: [], currentProfileId: null, currentProfileRole: null, currentProfileIsOwner: false }

    const userId = session.user.id
    const currentProfileId: string | null = (session.user as any).sessionProfileId || null

    // [Sprint Z] Fetch all ProfileAccess rows once để map role per profile
    const allAccesses = await prisma.profileAccess.findMany({
        where: { userId },
        select: { profileId: true, role: true, grantedAt: true },
    })
    const accessMap = new Map(allAccesses.map((a) => [a.profileId, a]))

    // Fetch accessible profiles
    const profiles = await getAvailableProfiles()

    // [Sprint Z] Workspaces scoped theo profile role
    let workspaces: { id: string; name: string; description: string | null }[] = []
    if (currentProfileId) {
        const access = accessMap.get(currentProfileId)
        if (access?.role === 'OWNER') {
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        } else if (access?.role === 'ADMIN') {
            // Workspaces tạo SAU grantedAt + workspaces có explicit WorkspaceMember
            const autoWs = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, createdAt: { gte: access.grantedAt } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
            const explicitWs = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, members: { some: { userId } } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
            const merged = new Map<string, typeof autoWs[number]>()
            for (const w of [...autoWs, ...explicitWs]) merged.set(w.id, w)
            workspaces = Array.from(merged.values())
        } else if (access?.role === 'USER') {
            // USER: chỉ workspaces có explicit WorkspaceMember
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, members: { some: { userId } } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        }
        // else: no access → workspaces = []
    }

    const currentRole = currentProfileId ? accessMap.get(currentProfileId)?.role ?? null : null

    return {
        profiles: profiles.map((p: any) => ({
            id: p.id,
            name: p.name,
            userCount: p._count?.users ?? 0,
            workspaceCount: p._count?.workspaces ?? 0,
            // [Sprint Z] currentRole per profile — gate UI (only OWNER/ADMIN see create button)
            currentRole: accessMap.get(p.id)?.role ?? null,
            // [Sprint Y compat] isOwner kept for backward-compat; now means role===OWNER
            isOwner: accessMap.get(p.id)?.role === 'OWNER',
        })),
        workspaces,
        currentProfileId,
        // [Sprint Z] role at current profile (replaces isOwner binary)
        currentProfileRole: currentRole,
        // [Sprint Y compat] keep boolean for old callers — now means canCreateWorkspace
        currentProfileIsOwner: currentRole === 'OWNER' || currentRole === 'ADMIN',
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
            // [Sprint Z] Grant access với role=OWNER — user tạo profile = chủ profile.
            // Sprint Y bug: ProfileAccess được tạo nhưng KHÔNG có role → user không
            // tạo workspace được trong profile mình mới tạo. Sprint Z fix.
            await tx.profileAccess.create({
                data: { userId: session.user.id, profileId: profile.id, role: 'OWNER' },
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

        return { success: true }
    } catch (error) {
        return { error: 'Failed to change password' }
    }
}
