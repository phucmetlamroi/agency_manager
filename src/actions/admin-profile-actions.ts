'use server'

/**
 * [Sprint Z] DEPRECATED — super admin profile management.
 *
 * Trong SaaS multi-tenant model:
 *   - createProfile: dùng `createProfileForUser` (src/actions/profile-actions.ts)
 *     thay vì super admin. Mọi user tự tạo profile riêng của mình.
 *   - updateProfile / deleteProfile: chỉ Owner của specific profile mới làm,
 *     KHÔNG còn super admin override. Sẽ implement trong profile-member-actions
 *     hoặc profile-settings flow sau.
 *   - changeUserProfile: DELETED hoàn toàn. User chuyển profile bằng cách Owner
 *     của target profile invite (qua inviteToProfileAction).
 *
 * Functions ở đây hiện CHỈ throw error để alert caller không nên dùng nữa.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getProfileRole } from '@/lib/profile-permissions'

const DEPRECATED_ERROR = 'Function này đã được loại bỏ trong Sprint Z (SaaS RBAC). Dùng profile-member-actions hoặc createProfileForUser thay thế.'

export async function createProfile(_data: { name: string; bannerUrl?: string; logoUrl?: string }) {
    throw new Error(DEPRECATED_ERROR)
}

export async function updateProfile(id: string, data: { name: string; bannerUrl?: string; logoUrl?: string }) {
    const session = await getSession()
    if (!session?.user?.id) throw new Error('Unauthorized')

    // [Sprint Z] Only profile Owner can update.
    const role = await getProfileRole(session.user.id, id)
    if (role !== 'OWNER') {
        throw new Error('Chỉ Owner của Profile mới có quyền update.')
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
        },
    })

    return { success: true, profile: updatedProfile }
}

export async function deleteProfile(id: string) {
    const session = await getSession()
    if (!session?.user?.id) throw new Error('Unauthorized')

    // [Sprint Z] Only profile Owner can delete.
    const role = await getProfileRole(session.user.id, id)
    if (role !== 'OWNER') {
        throw new Error('Chỉ Owner của Profile mới có quyền xóa.')
    }

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
        prisma.profile.delete({ where: { id } }),
    ])

    return { success: true }
}

export async function changeUserProfile(_userId: string, _newProfileId: string | null, _workspaceId: string) {
    throw new Error(DEPRECATED_ERROR + ' (Dùng inviteToProfileAction thay vì assign cross-profile manually.)')
}
