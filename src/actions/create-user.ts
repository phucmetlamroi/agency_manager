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
    let incomingProfileId = formData.get('profileId') as string || null

    if (!username || !password) return { error: 'Missing fields' }

    try {
        // Find the creator to determine their rights
        const creator = await prisma.user.findUnique({
            where: { id: session.user.id }
        })

        if (!creator) return { error: 'Creator not found' }

        // Super Admin check for Profile choice
        let assignedProfileId = null
        if (creator.username === 'admin') {
            assignedProfileId = incomingProfileId
        } else {
            // Normal Admin creates users within their own profile
            if (!creator.profileId) return { error: 'Admin không thuộc về Team nào nên không thể tạo nhân sự.' }
            assignedProfileId = creator.profileId
        }

        const hashedPassword = await bcrypt.hash(password, 10)
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role,
                profileId: assignedProfileId,
                hasAcceptedTerms: role === 'ADMIN'
            }
        })
        revalidatePath(`/${workspaceId}/admin/users`)
        revalidatePath(`/${workspaceId}/admin`) // Update Dashboard dropdown
        return { success: true }
    } catch (e) {
        return { error: 'Error creating user' }
    }
}
