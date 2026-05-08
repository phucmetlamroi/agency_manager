'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'

export async function changePassword(formData: FormData, workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const newPassword = formData.get('newPassword') as string

    if (!newPassword || newPassword.length < 6) {
        return { error: 'Mật khẩu phải có ít nhất 6 ký tự' }
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
            where: { id: session.user.id },
            data: {
                password: hashedPassword
            }
        })

        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/admin/users`) // Make sure admin sees the change
        return { success: true }
    } catch (e) {
        return { error: 'Đổi mật khẩu thất bại' }
    }
}

export async function updateUserRole(userId: string, newRole: string, workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Super Admin Protection
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, role: true },
        })
        if (targetUser?.username === 'admin') {
            return { success: false, error: 'KHÔNG THỂ THAY ĐỔI QUYỀN CỦA SUPER ADMIN!' }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole as UserRole }
        })

        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'member.role_changed',
            targetType: 'User',
            targetId: userId,
            before: { role: targetUser?.role },
            after: { role: newRole },
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        return { success: false, error: 'Failed to update role' }
    }
}

/**
 * @deprecated Hard-delete user vi phạm PDPL Việt Nam (Luật 91/2025/QH15) —
 * chỉ user mới được xóa data của mình. Dùng `deactivateUser()` thay thế.
 *
 * Backward-compat: vẫn export, internally call deactivateUser() để các UI cũ
 * không vỡ. Sẽ remove hoàn toàn ở Sprint 4.
 */
export async function deleteUser(userId: string, workspaceId: string) {
    return deactivateUser(userId, workspaceId)
}

/**
 * Deactivate user — set role=LOCKED, bump sessionVersion (force logout mọi
 * session đang active), audit log đầy đủ. KHÔNG xóa data → preserve nghiệp vụ
 * (tasks, comments, audit history) và compliance PDPL.
 *
 * Để remove user khỏi workspace cụ thể (giữ account active), dùng
 * `removeWorkspaceMember()` trong member-actions.ts thay vì hàm này.
 */
export async function deactivateUser(userId: string, workspaceId: string) {
    try {
        const { userId: actorId, session } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, role: true, sessionVersion: true, displayName: true, profileId: true },
        })
        if (!targetUser) {
            return { success: false, error: 'User không tồn tại.' }
        }

        // Audit fix #2.6: profile scoping check
        // Trước: workspace ADMIN có thể deactivate user thuộc profile khác (cross-tenant)
        // Sau: target user phải cùng profile với caller (hoặc caller là global ADMIN)
        const callerProfileId = (session?.user as any)?.sessionProfileId
        const callerIsGlobalAdmin = (session?.user as any)?.role === 'ADMIN'
        if (!callerIsGlobalAdmin && targetUser.profileId && targetUser.profileId !== callerProfileId) {
            return {
                success: false,
                error: 'Bạn không thể deactivate user thuộc Profile khác.',
            }
        }

        // Super Admin Protection
        if (targetUser.username === 'admin') {
            return { success: false, error: 'KHÔNG THỂ DEACTIVATE SUPER ADMIN!' }
        }

        // Đã LOCKED rồi → idempotent
        if (targetUser.role === 'LOCKED') {
            return { success: true, message: 'User đã ở trạng thái deactivated.' }
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                role: 'LOCKED',
                // Bump sessionVersion → invalidate tất cả JWT cũ → force logout
                sessionVersion: { increment: 1 },
            },
        })

        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'user.deactivated',
            targetType: 'User',
            targetId: userId,
            before: {
                username: targetUser.username,
                displayName: targetUser.displayName,
                role: targetUser.role,
            },
            after: { role: 'LOCKED' },
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true, message: 'User đã được deactivate. Account giữ nguyên data, không thể đăng nhập.' }
    } catch (error: any) {
        console.error(error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        return { success: false, error: 'Failed to deactivate user' }
    }
}

/**
 * Reactivate user đã deactivated (LOCKED → USER hoặc role cũ).
 * Để complement với deactivateUser khi admin nhầm lẫn.
 */
export async function reactivateUser(userId: string, newRole: 'USER' | 'AGENCY_ADMIN' | 'CLIENT', workspaceId: string) {
    try {
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, role: true },
        })
        if (!targetUser) return { success: false, error: 'User không tồn tại.' }
        if (targetUser.role !== 'LOCKED') {
            return { success: false, error: 'User không ở trạng thái deactivated.' }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole },
        })

        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'user.reactivated',
            targetType: 'User',
            targetId: userId,
            before: { role: 'LOCKED' },
            after: { role: newRole },
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        return { success: false, error: 'Failed to reactivate user' }
    }
}

/**
 * @deprecated Admin đặt password user khác là vi phạm bảo mật nghiêm trọng:
 *   - Admin có thể đăng nhập làm user → impersonation không log
 *   - Vi phạm OWASP A01 (Broken Access Control)
 *   - Best practice (Microsoft/Google/Slack): admin chỉ TRIGGER reset, user
 *     tự đặt password mới qua email OTP
 *
 * Hàm này throw error luôn để mọi caller biết phải migrate sang
 * `triggerForcePasswordReset()`.
 */
export async function adminResetPassword(_userId: string, _newPassword: string, _workspaceId: string) {
    return {
        success: false,
        error: 'Tính năng này đã bị vô hiệu hóa vì lý do bảo mật. Vui lòng dùng "Force password reset" để gửi email OTP cho user tự reset.',
    }
}

/**
 * Trigger force password reset cho user khác. Thay thế adminResetPassword.
 *
 * Flow an toàn:
 *   1. Admin click "Force reset password" cho user X
 *   2. Server generate OTP + lưu DB (purpose=PASSWORD_RESET)
 *   3. Server gửi email OTP đến User X
 *   4. User X tự click forgot-password → nhập OTP → đặt password mới
 *   5. Admin KHÔNG bao giờ thấy password
 *
 * Reuse logic từ password-reset-actions.ts để consistent với public flow.
 */
export async function triggerForcePasswordReset(userId: string, workspaceId: string) {
    try {
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, username: true, email: true, displayName: true, role: true },
        })
        if (!targetUser) return { success: false, error: 'User không tồn tại.' }

        // User chưa có email → không thể gửi OTP
        if (!targetUser.email) {
            return {
                success: false,
                error: `User ${targetUser.username} chưa có email. Vui lòng yêu cầu user nhập email trước (qua Email Migration Modal).`,
            }
        }

        if (targetUser.role === 'LOCKED') {
            return { success: false, error: 'User đã bị deactivated. Reactivate trước khi reset password.' }
        }

        // Reuse public forgot-password flow
        const { requestPasswordResetOtp } = await import('./password-reset-actions')
        const result = await requestPasswordResetOtp(targetUser.email)

        // Audit log: admin trigger force reset (audit trail quan trọng)
        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'auth.admin_force_reset_triggered',
            targetType: 'User',
            targetId: userId,
            after: { email: targetUser.email, displayName: targetUser.displayName },
        })

        // Force reset luôn return generic success message (anti-enumeration)
        return {
            success: true,
            message: `Đã gửi email reset password đến ${targetUser.email}. User cần click link trong email để đặt password mới.`,
        }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        console.error('[triggerForcePasswordReset] error:', error)
        return { success: false, error: 'Không thể trigger reset password.' }
    }
}
