'use server'

import { prisma } from '@/lib/db'
import * as bcrypt from 'bcryptjs'
import { revalidatePath } from 'next/cache'
import { UserRole } from '@prisma/client'
import { verifyProfileAdminAccess } from '@/lib/security'
import { validateEmailForSignup } from '@/lib/email-validator'
import { checkInviteCallerRate } from '@/lib/rate-limit-upstash'

/**
 * Admin tạo user invite-only (legacy flow song song với public signup).
 *
 * Audit fix #3.7: Trước đây không có email field → user cũ Việt Nam username
 * không có email migrate. Giờ thêm OPTIONAL email field với validation.
 */
export async function createUser(formData: FormData, workspaceId: string) {
    // [AUDIT R12 — fix] Was gated only by getSession() — ANY authenticated user could
    // mint login-able accounts (with attacker-chosen passwords) and stamp them role=ADMIN
    // in their own tenant. Require profile-scoped ADMIN authority (the same predicate the
    // admin UI uses), matching the sibling invite flows (inviteToWorkspace/inviteToProfile).
    let access
    try {
        access = await verifyProfileAdminAccess(workspaceId)
    } catch (e: any) {
        if (e?.message?.startsWith('SECURITY_VIOLATION')) return { error: 'Forbidden' }
        return { error: 'Unauthorized' }
    }
    const session = access.session

    const username = (formData.get('username') as string || '').trim()
    const password = formData.get('password') as string
    const email = (formData.get('email') as string || '').trim().toLowerCase()
    const displayName = (formData.get('displayName') as string || '').trim() || null
    const role = (formData.get('role') as string || 'USER') as UserRole
    let incomingProfileId = formData.get('profileId') as string || null

    if (!username || !password) return { error: 'Missing fields' }

    // [BILLING P6] Cửa tạo tài khoản TRỰC TIẾP — bỏ qua toàn bộ luồng lời mời, mint User
    // với profileId ngay lập tức (usage.ts:33-43 ghi rõ lỗ này ở phía ĐẾM; đây là phía CHẶN).
    // Ghế tiêu ngay tại đây nên phải soát ngay tại đây.
    {
        const { checkSeatCap, billingErrorMessage } = await import('@/lib/billing/entitlements')
        const { resolveWorkspaceProfileId } = await import('@/lib/prisma-workspace')
        const pid = await resolveWorkspaceProfileId(workspaceId)
        if (pid) {
            try { await checkSeatCap(pid) } catch (e) {
                const msg = billingErrorMessage(e)
                if (msg) return { error: msg }
                throw e
            }
        }
    }

    // [AUDIT R12 — fix] Constrain to non-privileged roles — never let this path mint the
    // legacy global ADMIN (or CLIENT/LOCKED). Mirrors ASSIGNABLE_ROLES in updateUserRole.
    const ASSIGNABLE_ROLES: UserRole[] = [UserRole.USER, UserRole.AGENCY_ADMIN]
    if (!ASSIGNABLE_ROLES.includes(role)) {
        return { error: 'Vai trò không hợp lệ.' }
    }

    // Audit fix #3.7: validate email nếu có (optional field)
    if (email) {
        const v = validateEmailForSignup(email)
        if (!v.valid) {
            return { error: v.message ?? 'Email không hợp lệ.' }
        }
        // [AUDIT ENUM-1 — fix] The duplicate check below is a GLOBAL (cross-tenant) findFirst that
        // returns a distinguishable "đã được sử dụng" message → an email→exists oracle. Any
        // self-registered user is OWNER of their own profile, so this door is reachable. Cap probing
        // with the SAME caller-scoped throttle the invite doors use (R2) so it can't be looped for
        // mass email harvesting (40/h/caller).
        const callerRate = await checkInviteCallerRate(session.user.id)
        if (!callerRate.success) {
            return { error: `Bạn đang thao tác quá nhanh. Vui lòng thử lại sau ${callerRate.retryAfter ?? 3600} giây.` }
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
