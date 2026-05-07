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

export async function deleteUser(userId: string, workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        const { userId: actorId } = await verifyWorkspaceAccess(workspaceId, 'ADMIN')

        // Super Admin Protection
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { username: true, role: true },
        })
        if (targetUser?.username === 'admin') {
            return { success: false, error: 'KHÔNG THỂ XÓA SUPER ADMIN!' }
        }

        await prisma.user.delete({
            where: { id: userId }
        })

        await audit({
            workspaceId,
            actorUserId: actorId,
            action: 'member.removed',
            targetType: 'User',
            targetId: userId,
            before: { username: targetUser?.username, role: targetUser?.role },
        })

        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error: any) {
        console.error(error)
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        return { success: false, error: 'Failed to delete user' }
    }
}

export async function adminResetPassword(userId: string, newPassword: string, workspaceId: string) {
    try {
        // SECURITY: workspace-scoped admin check (was global ADMIN only).
        await verifyWorkspaceAccess(workspaceId, 'ADMIN')
        const session = await getSession()
        const currentUser = await prisma.user.findUnique({ where: { id: session?.user?.id } })

        // Super Admin Protection
        const targetUser = await prisma.user.findUnique({ where: { id: userId } })
        if (targetUser?.username === 'admin') {
            // Allow ONLY if currentUser is also 'admin'
            // Note: currentUser was fetched above at line 78
            if (currentUser?.username !== 'admin') {
                return { success: false, error: 'KHÔNG THỂ ĐỔI MẬT KHẨU CỦA SUPER ADMIN!' }
            }
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10)

        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword
            }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        return { success: true }
    } catch (error: any) {
        if (error?.message?.startsWith('SECURITY_VIOLATION')) {
            return { success: false, error: error.message }
        }
        return { success: false, error: 'Failed' }
    }
}
