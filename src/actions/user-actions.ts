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
