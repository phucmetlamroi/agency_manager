'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'

/**
 * Gửi yêu cầu "Du học": Admin team gốc xin cấp quyền cho user vào team khác.
 */
export async function requestCrossTeamAccess(userId: string, targetProfileId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const requestedById = session?.user?.id
        if (!requestedById) return { success: false, error: 'Chưa đăng nhập' }

        // Kiểm tra xem user này đã thuộc Profile này chưa
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        if (user?.profileId === targetProfileId) return { success: false, error: 'User đã thuộc team này (team gốc)' }

        // Kiểm tra xem đã có access chưa
        const existingAccess = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId: targetProfileId } }
        })
        if (existingAccess) return { success: false, error: 'User đã có quyền truy cập team này' }

        // Max 5 profiles per user
        const accessCount = await prisma.profileAccess.count({ where: { userId } })
        if (accessCount >= 5) return { success: false, error: 'User này đã đạt giới hạn tối đa 5 team du học' }

        // Kiểm tra request pending
        const existingRequest = await prisma.profileAccessRequest.findUnique({
            where: { userId_targetProfileId: { userId, targetProfileId } }
        })

        if (existingRequest) {
            if (existingRequest.status === 'PENDING') return { success: false, error: 'Đang có một yêu cầu chờ duyệt ch team này' }
            // Nếu REJECTED thì có thể update lại thành PENDING
            if (existingRequest.status === 'REJECTED') {
                await prisma.profileAccessRequest.update({
                    where: { id: existingRequest.id },
                    data: { status: 'PENDING', requestedById }
                })
                revalidatePath(`/${workspaceId}/admin/users`)
                return { success: true }
            }
        }

        // Tạo yêu cầu mới
        await prisma.profileAccessRequest.create({
            data: {
                userId,
                targetProfileId,
                requestedById
            }
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error) {
        console.error('requestCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi gửi yêu cầu' }
    }
}

/**
 * Duyệt yêu cầu "Du học" (chỉ Admin team đích mới được duyệt)
 */
export async function approveCrossTeamAccess(requestId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const approvedById = session?.user?.id
        if (!approvedById) return { success: false, error: 'Chưa đăng nhập' }

        const request = await prisma.profileAccessRequest.findUnique({ where: { id: requestId } })
        if (!request || request.status !== 'PENDING') return { success: false, error: 'Yêu cầu không hợp lệ hoặc đã xử lý' }

        // Thêm quyền truy cập
        await prisma.$transaction([
            prisma.profileAccess.upsert({
                where: { userId_profileId: { userId: request.userId, profileId: request.targetProfileId } },
                update: {},
                create: { userId: request.userId, profileId: request.targetProfileId }
            }),
            prisma.profileAccessRequest.update({
                where: { id: requestId },
                data: { status: 'APPROVED', approvedById }
            })
        ])

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error) {
        console.error('approveCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi duyệt yêu cầu' }
    }
}

/**
 * Từ chối yêu cầu "Du học"
 */
export async function rejectCrossTeamAccess(requestId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const approvedById = session?.user?.id
        if (!approvedById) return { success: false, error: 'Chưa đăng nhập' }

        await prisma.profileAccessRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED', approvedById }
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error) {
        console.error('rejectCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi từ chối yêu cầu' }
    }
}

/**
 * Hủy bỏ quyền "Du học" (Cả admin team gốc và team đích đều có thể gỡ)
 */
export async function removeCrossTeamAccess(userId: string, profileId: string, workspaceId: string) {
    try {
        // Xóa ProfileAccess và Reset luôn ProfileAccessRequest để có thể xin lại sau
        await prisma.$transaction([
            prisma.profileAccess.delete({
                where: { userId_profileId: { userId, profileId } }
            }),
            prisma.profileAccessRequest.deleteMany({
                where: { userId, targetProfileId: profileId }
            })
        ])

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error) {
        console.error('removeCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi gỡ quyền du học' }
    }
}
