'use server'

import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { hash, compare } from 'bcryptjs'

export async function updateProfile(userId: string, data: {
    nickname?: string
    phoneNumber?: string
    email?: string
    avatar?: string // Placeholder for future
}) {
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

        revalidatePath('/dashboard')
        revalidatePath('/dashboard/profile')
        revalidatePath('/admin/users') // Admin needs to see new nicknames

        return { success: true }
    } catch (error) {
        console.error('Update profile error:', error)
        return { error: 'Failed to update profile' }
    }
}

export async function changePassword(userId: string, currentPass: string, newPass: string) {
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
                password: hashedPassword,
                // If we want to clear plainPassword for security after user changes it manually:
                plainPassword: null
            }
        })

        return { success: true }
    } catch (error) {
        return { error: 'Failed to change password' }
    }
}
