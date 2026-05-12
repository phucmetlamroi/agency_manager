'use server'

import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { validateEmailForSignup } from '@/lib/email-validator'

/**
 * Admin tạo user invite-only (legacy flow song song với public signup).
 *
 * Audit fix #3.7: Trước đây không có email field → user cũ Việt Nam username
 * không có email migrate. Giờ thêm OPTIONAL email field với validation.
 */
export async function createUser(formData: FormData, workspaceId: string) {
    const session = await getSession()
    if (!session?.user) return { error: 'Unauthorized' }

    const username = (formData.get('username') as string || '').trim()
    const password = formData.get('password') as string
    const email = (formData.get('email') as string || '').trim().toLowerCase()
    const displayName = (formData.get('displayName') as string || '').trim() || null
    const role = (formData.get('role') as string || 'USER') as UserRole
    let incomingProfileId = formData.get('profileId') as string || null

    if (!username || !password) return { error: 'Missing fields' }

    // Audit fix #3.7: validate email nếu có (optional field)
    if (email) {
        const v = validateEmailForSignup(email)
        if (!v.valid) {
            return { error: v.message ?? 'Email không hợp lệ.' }
        }
        // Check email không trùng
        const existing = await prisma.user.findFirst({
            where: { email },
            select: { id: true },
        })
        if (existing) {
            return { error: `Email "${email}" đã được sử dụng.` }
        }
    }

    try {
        // Find the creator to determine their rights
        const creator = await prisma.user.findUnique({
            where: { id: session.user.id }
        })

        if (!creator) return { error: 'Creator not found' }

        // [Sprint Z] Super admin removed. Profile chỉ là profile của creator
        // (User.profileId). Cross-profile assignment qua inviteToProfileAction.
        if (!creator.profileId) return { error: 'Bạn không thuộc về Profile nào nên không thể tạo nhân sự.' }
        const assignedProfileId = creator.profileId
        // incomingProfileId từ caller bị ignored (no super admin to override)
        void incomingProfileId

        const hashedPassword = await bcrypt.hash(password, 10)
        await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
                role,
                profileId: assignedProfileId,
                // Audit fix #3.7: store email + displayName nếu admin cung cấp
                ...(email ? { email, hasCompletedEmailMigration: true } : {}),
                displayName: displayName ?? username,
            }
        })
        revalidatePath(`/${workspaceId}/admin`)
        return { success: true }
    } catch (e: any) {
        // P2002 = unique constraint violation (username trùng)
        if (e?.code === 'P2002') {
            return { error: 'Username đã tồn tại.' }
        }
        return { error: 'Error creating user' }
    }
}
