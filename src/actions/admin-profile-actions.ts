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
 * ⚠️ [AUDIT HT-033 fix] CHÚ THÍCH DƯỚI ĐÂY TỪNG SAI, và cái sai đó đủ để một lỗ hổng sống sót
 * qua cả một vòng kiểm toán: câu "Functions ở đây hiện CHỈ throw error" chỉ đúng với
 * `createProfile` và `changeUserProfile`. `updateProfile` và `deleteProfile` là mã ĐANG CHẠY —
 * chúng đọc phiên, kiểm quyền và ghi vào DB thật. Ai đọc header rồi bỏ qua file này là bỏ sót
 * đúng hai đường ghi.
 */

import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { getProfileRole, isSessionLive } from '@/lib/profile-permissions'

/**
 * [AUDIT HT-033 fix] Chốt liveness cho hai hàm CÒN SỐNG trong file này.
 *
 * Bảng phát hiện của HT-033 xếp file này vào ô "xem finding riêng", và ở vòng vá trước tôi tin
 * dòng đó mà không kiểm — đúng cách tôi đã mất một vòng ở HT-023 (làm theo remedy sai của tài
 * liệu kiểm toán). Người phản biện tra ra: finding riêng ấy là P3-006, đã ĐÓNG với kết luận
 * FALSE_POSITIVE, và nó nói về cổng `username === 'admin'` chứ KHÔNG nói gì về liveness. Nghĩa là
 * khoảng hở liveness ở đây không thuộc về ai cả.
 *
 * Vì sao nó thật: `getProfileRole` chỉ đọc `ProfileAccess.role` — chính vị từ mà toàn bộ finding
 * này nói là không đủ. Một OWNER đã bị KHOÁ vẫn đổi được tên/logo/banner của profile, và xoá được
 * một profile rỗng bằng một transaction gỡ profileId khỏi Payroll / Invoice / MonthlyBonus /
 * PayrollLock trước khi xoá.
 */
async function requireLiveOwner(profileId: string): Promise<string> {
    const session = await getSession()
    if (!session?.user?.id) throw new Error('Unauthorized')
    if (!(await isSessionLive(session))) {
        throw new Error('Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.')
    }
    const role = await getProfileRole(session.user.id, profileId)
    if (role !== 'OWNER') {
        throw new Error('Chỉ Owner của Profile mới có quyền thực hiện thao tác này.')
    }
    return session.user.id
}

const DEPRECATED_ERROR = 'Function này đã được loại bỏ trong Sprint Z (SaaS RBAC). Dùng profile-member-actions hoặc createProfileForUser thay thế.'

export async function createProfile(_data: { name: string; bannerUrl?: string; logoUrl?: string }) {
    throw new Error(DEPRECATED_ERROR)
}

export async function updateProfile(id: string, data: { name: string; bannerUrl?: string; logoUrl?: string }) {
    // [Sprint Z] Only profile Owner can update. [AUDIT HT-033 fix] …và phiên phải còn sống.
    await requireLiveOwner(id)

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
    // [Sprint Z] Only profile Owner can delete. [AUDIT HT-033 fix] …và phiên phải còn sống.
    await requireLiveOwner(id)

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
