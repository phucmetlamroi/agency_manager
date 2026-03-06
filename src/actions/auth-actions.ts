'use server'

import { prisma } from '@/lib/db'
import { login } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { UserRole } from '@prisma/client'

export async function loginAction(prevState: any, formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    if (!username || !password) {
        return { error: 'Vui lòng nhập đầy đủ thông tin' }
    }

    console.log(`[Login] Attempt for user: ${username}`)

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        })

        if (!user) {
            console.log(`[Login] User not found: ${username}`)
            return { error: 'Tài khoản không tồn tại' }
        }

        const isValid = await bcrypt.compare(password, user.password)

        if (!isValid) {
            console.log(`[Login] Invalid password for: ${username}`)
            return { error: 'Mật khẩu không chính xác' }
        }

        console.log(`[Login] Success for: ${username}, role: ${user.role}`)
        // Login success
        await login({ id: user.id, username: user.username, role: user.role })
        console.log(`[Login] Cookie set for: ${username}`)

    } catch (err) {
        console.error('[Login] ERROR:', err)
        return { error: 'Đã có lỗi xảy ra' }
    }

    console.log(`[Login] Redirecting ${username} to /workspaces`)
    // Redirect all users to the Workspace Portal
    redirect('/workspaces')
}
