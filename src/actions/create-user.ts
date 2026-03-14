'use server'

import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { getSession } from '@/lib/auth'

export async function createUser(formData: FormData, workspaceId: string) {
    const session = await getSession()
    if (!session?.user) return { error: 'Unauthorized' }
    const username = formData.get('username') as string
    const password = formData.get('password') as string
    const role = (formData.get('role') as string || 'USER') as UserRole
    const agencyId = formData.get('agencyId') as string || null
    let incomingProfileId = formData.get('profileId') as string || null

    if (!username || !password) return { error: 'Missing fields' }

    try {
        // Find the creator to determine their rights
        const creator = await prisma.user.findUnique({
            where: { id: session.user.id }
        })

        if (!creator) return { error: 'Creator not found' }

        if (creator.username !== 'admin') {
            return { error: 'Forbidden: Chỉ Admin tối thượng mới có quyền tạo tài khoản.' }
        }

        // Logic for Profile Assignment - Super Admin MUST provide a profileId
        let assignedProfileId = incomingProfileId

        const hashedPassword = await bcrypt.hash(password, 10)
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                plainPassword: password,
                role,
                agencyId: agencyId, // Link to Agency
                profileId: assignedProfileId
            }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        revalidatePath(`/${workspaceId}/admin`) // Update Dashboard dropdown
        return { success: true }
    } catch (e) {
        return { error: 'Error creating user' }
    }
}
