'use server'

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export async function createProfile(data: { name: string, bannerUrl?: string, logoUrl?: string }) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    const { name, bannerUrl, logoUrl } = data

    if (!name || name.trim() === '') {
        throw new Error('Profile name is required')
    }

    const newProfile = await prisma.profile.create({
        data: {
            name: name.trim(),
            bannerUrl: bannerUrl?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
        }
    })

    return { success: true, profile: newProfile }
}

export async function updateProfile(id: string, data: { name: string, bannerUrl?: string, logoUrl?: string }) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    const { name, bannerUrl, logoUrl } = data

    if (!name || name.trim() === '') {
        throw new Error('Profile name is required')
    }

    const updatedProfile = await prisma.profile.update({
        where: { id },
        data: {
            name: name.trim(),
            bannerUrl: bannerUrl?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
        }
    })

    return { success: true, profile: updatedProfile }
}

export async function deleteProfile(id: string) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    // [Sprint K P1] Reject delete nếu profile có active references.
    // Trước đây nullify FK trên 10 tables → orphaned data tạo ra không revert được.
    // Yêu cầu super admin hard-delete deps trước (tasks/workspaces/etc.) để
    // tránh "lost forever" data.
    const [userCount, workspaceCount, taskCount] = await Promise.all([
        prisma.user.count({ where: { profileId: id } }),
        prisma.workspace.count({ where: { profileId: id, status: { not: 'HARD_DELETED' as any } } }),
        prisma.task.count({ where: { profileId: id, isArchived: false } }),
    ])
    if (userCount > 0 || workspaceCount > 0 || taskCount > 0) {
        return {
            error: `Profile còn ${userCount} user / ${workspaceCount} workspace active / ${taskCount} task. Vui lòng remove trước.`,
        }
    }

    // Since we are "Super Admin", we can delete even if there are members.
    // We will nullify the profileId on all related models to avoid foreign key violations.
    await prisma.$transaction([
        prisma.user.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.workspace.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.task.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.client.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.project.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.invoice.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.payroll.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.monthlyBonus.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.payrollLock.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.performanceMetric.updateMany({ where: { profileId: id }, data: { profileId: null } }),
        prisma.profile.delete({ where: { id } })
    ])

    return { success: true }
}

export async function changeUserProfile(userId: string, newProfileId: string | null, workspaceId: string) {
    const session = await getSession()
    if (session?.user?.username !== 'admin') {
        throw new Error('Unauthorized')
    }

    try {
        // [Sprint K P1] Validate target profile exists trước khi update.
        // Trước đây ko check → super admin có thể set profileId = id ko tồn tại
        // → User mồ côi profile, không vào được app.
        if (newProfileId) {
            const target = await prisma.profile.findUnique({
                where: { id: newProfileId },
                select: { id: true },
            })
            if (!target) return { error: 'Profile đích không tồn tại' }
        }

        // [Sprint K P1] Verify target user exists.
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, profileId: true },
        })
        if (!targetUser) return { error: 'User không tồn tại' }
        if (targetUser.profileId === newProfileId) {
            return { error: 'User đã thuộc profile này' }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { profileId: newProfileId }
        })
        // void workspaceId — kept for future audit logging context
        void workspaceId
        return { success: true }
    } catch (e) {
        console.error('changeUserProfile error:', e)
        return { error: 'Failed to change user team' }
    }
}
