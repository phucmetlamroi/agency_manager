'use server'

import { prisma } from '@/lib/db'
import { login } from '@/lib/auth'
import * as bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { UserRole } from '@prisma/client'

export async function loginAction(prevState: any, formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string

    if (!username || !password) {
        return { error: 'Vui lòng nhập đầy đủ thông tin' }
    }

    try {
        const user = await prisma.user.findUnique({
            where: { username },
        })

        if (!user) {
            return { error: 'Tài khoản không tồn tại' }
        }

        const isValid = await bcrypt.compare(password, user.password)

        if (!isValid) {
            return { error: 'Mật khẩu không chính xác' }
        }

        // Login success
        await login({ id: user.id, username: user.username, role: user.role })

    } catch (err) {
        console.error(err)
        return { error: 'Đã có lỗi xảy ra' }
    }

    // Redirect all users to the Workspace Portal
    redirect('/workspaces')
}
