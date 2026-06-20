'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { getProfileRole } from '@/lib/profile-permissions'

/**
 * Gửi yêu cầu "Du học": Admin team gốc xin cấp quyền cho user vào team khác.
 */
export async function requestCrossTeamAccess(userId: string, targetProfileId: string, workspaceId: string) {
    try {
        const session = await getSession()
        const requestedById = session?.user?.id
        if (!requestedById) return { success: false, error: 'Chưa đăng nhập' }

        // [Sprint K P1] Verify target profile exists trước khi tạo request.
        // Trước đây create với targetProfileId không tồn tại → orphaned PENDING
        // request, không bao giờ duyệt được vì không có admin profile target.
        const targetProfile = await prisma.profile.findUnique({
            where: { id: targetProfileId },
            select: { id: true },
        })
        if (!targetProfile) return { success: false, error: 'Team đích không tồn tại' }

        // Kiểm tra xem user này đã thuộc Profile này chưa
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        if (!user) return { success: false, error: 'Người dùng không tồn tại' }
        if (user.profileId === targetProfileId) return { success: false, error: 'User đã thuộc team này (team gốc)' }

        // [AUDIT R2 — fix] Authority check: the caller must be OWNER/ADMIN of the
        // user's ORIGIN profile to request cross-team ("du học") access on their
        // behalf. Previously ANY logged-in user could mint a request for an
        // arbitrary userId → arbitrary targetProfileId (cross-tenant escalation seed).
        if (!user.profileId) return { success: false, error: 'Người dùng không có team gốc.' }
        const callerOriginRole = await getProfileRole(requestedById, user.profileId)
        if (callerOriginRole !== 'OWNER' && callerOriginRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền gửi yêu cầu du học cho người dùng này.' }
        }

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

        // [AUDIT R2 — BLOCKER fix] Authority check: only an OWNER/ADMIN of the TARGET
        // profile may approve a request that grants access into it. Previously any
        // logged-in user could approve any PENDING request → mint cross-tenant
        // ProfileAccess into a profile they have no authority over.
        const approverRole = await getProfileRole(approvedById, request.targetProfileId)
        if (approverRole !== 'OWNER' && approverRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền duyệt yêu cầu vào team này.' }
        }

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

        // [AUDIT R2 — fix] Only an OWNER/ADMIN of the target profile may reject a
        // request into it (mirrors approveCrossTeamAccess).
        const request = await prisma.profileAccessRequest.findUnique({ where: { id: requestId } })
        if (!request) return { success: false, error: 'Yêu cầu không tồn tại' }
        const approverRole = await getProfileRole(approvedById, request.targetProfileId)
        if (approverRole !== 'OWNER' && approverRole !== 'ADMIN') {
            return { success: false, error: 'Bạn không có quyền từ chối yêu cầu vào team này.' }
        }

        await prisma.profileAccessRequest.update({
            where: { id: requestId },
            data: { status: 'REJECTED', approvedById }
        })

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
        // [AUDIT R2 — fix] Only an OWNER/ADMIN of the profile, or the user revoking
        // their OWN cross-team access, may remove. Previously this had NO auth at all
        // → any caller could delete ANY user's ProfileAccess in ANY profile.
        const session = await getSession()
        const callerId = session?.user?.id
        if (!callerId) return { success: false, error: 'Chưa đăng nhập' }
        const callerRole = await getProfileRole(callerId, profileId)
        const isProfileAdmin = callerRole === 'OWNER' || callerRole === 'ADMIN'
        if (!isProfileAdmin && callerId !== userId) {
            return { success: false, error: 'Bạn không có quyền gỡ quyền du học này.' }
        }

        // Xóa ProfileAccess và Reset luôn ProfileAccessRequest để có thể xin lại sau
        await prisma.$transaction([
            prisma.profileAccess.delete({
                where: { userId_profileId: { userId, profileId } }
            }),
            prisma.profileAccessRequest.deleteMany({
                where: { userId, targetProfileId: profileId }
            })
        ])

        return { success: true }
    } catch (error) {
        console.error('removeCrossTeamAccess failed:', error)
        return { success: false, error: 'Lỗi hệ thống khi gỡ quyền du học' }
    }
}
