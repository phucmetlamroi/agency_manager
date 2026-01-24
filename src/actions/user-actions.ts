'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

export async function changePassword(formData: FormData) {
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
                password: hashedPassword,
                plainPassword: newPassword // Sync back to admin
            }
        })

        revalidatePath('/dashboard')
        revalidatePath('/admin/users') // Make sure admin sees the change
        return { success: true }
    } catch (e) {
        return { error: 'Đổi mật khẩu thất bại' }
    }
}

export async function updateUserRole(userId: string, newRole: string) {
    try {
        // Super Admin Protection
        const targetUser = await prisma.user.findUnique({ where: { id: userId } })
        if (targetUser?.username === 'admin') {
            return { success: false, error: 'KHÔNG THỂ THAY ĐỔI QUYỀN CỦA SUPER ADMIN!' }
        }

        await prisma.user.update({
            where: { id: userId },
            data: { role: newRole }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed to update role' }
    }
}

export async function deleteUser(userId: string) {
    try {
        // Super Admin Protection
        const targetUser = await prisma.user.findUnique({ where: { id: userId } })
        if (targetUser?.username === 'admin') {
            return { success: false, error: 'KHÔNG THỂ XÓA SUPER ADMIN!' }
        }

        await prisma.user.delete({
            where: { id: userId }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (error) {
        console.error(error)
        return { success: false, error: 'Failed to delete user' }
    }
}

export async function adminResetPassword(userId: string, newPassword: string) {
    try {
        const session = await getSession()
        const currentUser = await prisma.user.findUnique({ where: { id: session?.user?.id } })

        if (currentUser?.role !== 'ADMIN') return { success: false, error: 'Unauthorized' }

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
                password: hashedPassword,
                plainPassword: newPassword
            }
        })
        revalidatePath('/admin/users')
        return { success: true }
    } catch (error) {
        return { success: false, error: 'Failed' }
    }
}
