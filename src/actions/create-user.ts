'use server'

import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'

export async function createUser(formData: FormData) {
    const username = formData.get('username') as string
    const password = formData.get('password') as string
    const role = formData.get('role') as string || 'USER'

    if (!username || !password) return { error: 'Missing fields' }

    try {
        const hashedPassword = await bcrypt.hash(password, 10)
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                plainPassword: password,
                role
            }
        })
        revalidatePath('/admin/users')
        revalidatePath('/admin') // Update Dashboard dropdown
        return { success: true }
    } catch (e) {
        return { error: 'Error creating user' }
    }
}
