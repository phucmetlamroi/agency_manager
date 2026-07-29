'use server'

import { prisma } from '@/lib/db'
import { cookies } from 'next/headers'
import { getSession, login } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { hash, compare } from 'bcryptjs'
import { audit } from '@/lib/audit-log'
import { redirect } from 'next/navigation'
import { UserRole } from '@prisma/client'

export async function checkProfileAccess(profileId: string) {
    const session = await getSession()
    if (!session?.user) return { success: false, error: 'Unauthorized' }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) return { success: false, error: 'User not found' }

    // [Sprint Z] Super admin bypass removed. Access via ProfileAccess row only.
    // Note: User.profileId không còn auto-grant access vì migration đã tạo
    // ProfileAccess(role=OWNER) cho creator của mỗi profile.
    const hasAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId: user.id, profileId } }
    })

    if (hasAccess) {
        return { success: true }
    }

    return { success: false, error: 'Bạn không có quyền truy cập vào Profile này.' }
}

export async function selectProfile(profileId: string) {
    const access = await checkProfileAccess(profileId)
    if (!access.success) {
        return access
    }

    const cookieStore = await cookies()
    cookieStore.set('current_profile_id', profileId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    })

    return { success: true }
}

export async function getAvailableProfiles() {
    const session = await getSession()
    if (!session?.user) return []

    const user = await prisma.user.findUnique({
        where: { id: session.user.id }
    })

    if (!user) return []

    // [Sprint Z] Super admin bypass removed. All users go through ProfileAccess
    // table. Migration tạo ProfileAccess(role=OWNER) cho creator + ProfileAccess(role=USER)
    // cho cross-team grants → unified path.
    const accessibleProfiles: any[] = []

    const profileAccesses = await prisma.profileAccess.findMany({
        where: { userId: user.id },
        include: {
            profile: {
                include: { _count: { select: { users: true, workspaces: true } } }
            }
        }
    })

    profileAccesses.forEach((acc: any) => {
        if (acc.profile) accessibleProfiles.push(acc.profile)
    })

    return accessibleProfiles
}

/**
 * Returns the user's accessible profiles AND workspaces for the current profile.
 * Used by the sidebar ProfileWorkspaceSwitcher component.
 *
 * [Sprint Z] Each profile object includes `currentRole: ProfileRole | null`
 * (OWNER/ADMIN/USER) from ProfileAccess.role. Workspace list is SCOPED:
 *   - OWNER: thấy tất cả workspaces của profile
 *   - ADMIN: workspaces createdAt >= grantedAt + những workspace có explicit WorkspaceMember
 *   - USER: chỉ workspaces có explicit WorkspaceMember
 */
export async function getMyProfilesAndWorkspaces() {
    const session = await getSession()
    if (!session?.user) return { profiles: [], workspaces: [], currentProfileId: null, currentProfileRole: null, currentProfileIsOwner: false }

    const userId = session.user.id
    const currentProfileId: string | null = (session.user as any).sessionProfileId || null

    // [Sprint Z] Fetch all ProfileAccess rows once để map role per profile
    const allAccesses = await prisma.profileAccess.findMany({
        where: { userId },
        select: { profileId: true, role: true, grantedAt: true },
    })
    const accessMap = new Map(allAccesses.map((a) => [a.profileId, a]))

    // Fetch accessible profiles
    const profiles = await getAvailableProfiles()

    // [Sprint Z] Workspaces scoped theo profile role
    let workspaces: { id: string; name: string; description: string | null }[] = []
    if (currentProfileId) {
        const access = accessMap.get(currentProfileId)
        if (access?.role === 'OWNER') {
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, status: { not: 'SOFT_DELETED' } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        } else if (access?.role === 'ADMIN') {
            // [Hotfix 2026-06-29 — "workspaces disappeared except Tháng 5/2026"]
            // ADMIN must see ALL workspaces of the profile, same as USER and OWNER.
            // Org-wide membership model (merge 63bb116, confirmed with owner): "a member
            // of the org is a member of every workspace". The previous filter
            // (createdAt >= grantedAt) ∪ (explicit WorkspaceMember) silently hid every
            // workspace created BEFORE the admin was promoted that they weren't an
            // explicit member of — so an admin granted recently saw ONLY the newest
            // workspace in their switcher, making it look like all data had vanished.
            // (The data was always intact; this was purely a listing filter.) Real
            // access is still gated by verifyWorkspaceAccess (security.ts MEMBER
            // fallback), so listing them here matches what the admin can already open.
            // Do NOT reintroduce the grantedAt / explicit-member filter for ADMIN.
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, status: { not: 'SOFT_DELETED' } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        } else if (access?.role === 'USER') {
            // [Sprint Z+1 hotfix] USER role thấy TẤT CẢ workspaces của profile
            // (read access). Trước đây chỉ thấy workspaces có explicit
            // WorkspaceMember, làm USER bị block khi assigned to task ngoài
            // workspaces họ là member. Match Sprint Y behavior + role-based gating
            // ở action layer (canCreateWorkspace cho create).
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, status: { not: 'SOFT_DELETED' } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        } else if (access?.role === 'CLIENT') {
            // [Client membership] CLIENT sees the profile's workspaces (view-only portal).
            workspaces = await prisma.workspace.findMany({
                where: { profileId: currentProfileId, status: { not: 'SOFT_DELETED' } },
                select: { id: true, name: true, description: true },
                orderBy: { createdAt: 'asc' }
            })
        }
        // else: no access → workspaces = []
    }

    const currentRole = currentProfileId ? accessMap.get(currentProfileId)?.role ?? null : null

    return {
        profiles: profiles.map((p: any) => ({
            id: p.id,
            name: p.name,
            userCount: p._count?.users ?? 0,
            workspaceCount: p._count?.workspaces ?? 0,
            // [Sprint Z] currentRole per profile — gate UI (only OWNER/ADMIN see create button)
            currentRole: accessMap.get(p.id)?.role ?? null,
            // [Sprint Y compat] isOwner kept for backward-compat; now means role===OWNER
            isOwner: accessMap.get(p.id)?.role === 'OWNER',
        })),
        workspaces,
        currentProfileId,
        // [Sprint Z] role at current profile (replaces isOwner binary)
        currentProfileRole: currentRole,
        // [Sprint Y compat] keep boolean for old callers — now means canCreateWorkspace
        currentProfileIsOwner: currentRole === 'OWNER' || currentRole === 'ADMIN',
    }
}

export async function updateProfile(userId: string, data: {
    nickname?: string
    phoneNumber?: string
    email?: string
    avatar?: string // Placeholder for future
}, workspaceId: string) {
    try {
        // [AUDIT R2 — CRITICAL fix] Was UNAUTHENTICATED and trusted the client-supplied
        // `userId` → anyone could rewrite ANY user's email/nickname/phone (account
        // takeover via the email-based password reset). Bind the write to the caller's
        // own account; the client-supplied userId is ignored.
        const session = await getSession()
        if (!session?.user?.id) return { error: 'Unauthorized' }
        // [AUDIT HT-033 fix] getSession() chỉ giải mã JWT — không chạm DB, nên không thấy được
        // tài khoản đã bị KHÓA hay phiên đã bị thu hồi (sessionVersion). Cùng chốt với
        // updateProfileSettings/deleteProfileAction ngay trong file này.
        const { isSessionLive } = await import('@/lib/profile-permissions')
        if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
        const targetId = session.user.id

        await prisma.user.update({
            where: { id: targetId },
            data: {
                nickname: data.nickname || null,
                phoneNumber: data.phoneNumber || null,
                // [AUDIT HT-013 fix] Email is intentionally NOT writable here. A direct write
                // bypasses OTP verification, letting a user claim an arbitrary (even a victim's)
                // email and hijack the email-based password-reset flow. Email changes must go
                // through the dedicated email-migration OTP flow (email-migration-actions.ts),
                // which verifies ownership and bumps sessionVersion.
                // avatar: data.avatar
            }
        })

        revalidatePath(`/${workspaceId}/dashboard`)
        revalidatePath(`/${workspaceId}/dashboard/profile`)

        return { success: true }
    } catch (error) {
        console.error('Update profile error:', error)
        return { error: 'Failed to update profile' }
    }
}

/**
 * Create a brand-new Profile for the current user.
 *
 * Use case: any authenticated user can create a Profile (Team) for themselves.
 * They become the OWNER (via ProfileAccess) — first member with elevated privileges.
 *
 * Differs from admin-profile-actions.ts createProfile which requires super-admin.
 *
 * Rate limit: max 5 profiles created per user (prevent abuse).
 */
export async function createProfileForUser(name: string) {
    const session = await getSession()
    if (!session?.user?.id) {
        return { error: 'Bạn cần đăng nhập' }
    }
    // [AUDIT HT-033 fix] ĐÂY LÀ NỬA ĐẦU CỦA ĐƯỜNG NÉ LỆNH KHOÁ, và là lý do finding này tồn tại.
    // Admin đặt role=LOCKED cho X, nhưng cookie JWT của X còn hiệu lực tới 7 ngày và getSession()
    // không hề đọc DB. X gọi thẳng action này (nó nằm trong action manifest vì được client
    // component tham chiếu, tức gọi được từ bên ngoài) → tạo Profile mới → tự thành OWNER qua
    // ProfileAccess → gọi createWorkspaceAction (nửa sau) → có workspace hoạt động bình thường.
    // Lệnh khoá tài khoản bị vô hiệu hoàn toàn mà không cần khai thác gì thêm.
    const { isSessionLive } = await import('@/lib/profile-permissions')
    if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }

    const trimmed = name?.trim()
    if (!trimmed) return { error: 'Tên profile không được để trống' }
    if (trimmed.length > 50) return { error: 'Tên profile không được quá 50 ký tự' }
    if (trimmed.length < 2) return { error: 'Tên profile phải có ít nhất 2 ký tự' }

    // Rate limit — max 5 profiles per user
    const ownedAccessCount = await prisma.profileAccess.count({
        where: { userId: session.user.id },
    })
    const ownedDirectCount = await prisma.profile.count({
        where: { users: { some: { id: session.user.id } } },
    })
    if (ownedAccessCount + ownedDirectCount >= 5) {
        return { error: 'Đã đạt giới hạn 5 profile/user. Hãy xoá profile cũ trước.' }
    }

    try {
        const newProfile = await prisma.$transaction(async (tx) => {
            const profile = await tx.profile.create({
                data: { name: trimmed },
            })
            // [Sprint Z] Grant access với role=OWNER — user tạo profile = chủ profile.
            // Sprint Y bug: ProfileAccess được tạo nhưng KHÔNG có role → user không
            // tạo workspace được trong profile mình mới tạo. Sprint Z fix.
            await tx.profileAccess.create({
                data: { userId: session.user.id, profileId: profile.id, role: 'OWNER' },
            })
            return profile
        })

        revalidatePath('/', 'layout')
        return { success: true, profile: { id: newProfile.id, name: newProfile.name } }
    } catch (e: any) {
        console.error('createProfileForUser error:', e)
        return { error: 'Không thể tạo profile. Vui lòng thử lại.' }
    }
}

/* ──────────────────────────────────────────────────────────────────── */
/*  [Sprint Z+1] Profile settings + soft-delete                          */
/* ──────────────────────────────────────────────────────────────────── */

const PROFILE_HARD_DELETE_GRACE_DAYS = 30

/**
 * [Sprint Z+1] Get profile settings (name + banner + logo + soft-delete state).
 * Any role can read. Owner uses kết quả này để render Settings UI.
 */
export async function getProfileSettings(profileId: string) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Bạn cần đăng nhập.' }

    const { getProfileRole } = await import('@/lib/profile-permissions')
    const role = await getProfileRole(session.user.id, profileId)
    if (!role) return { error: 'Bạn không có quyền truy cập Profile này.' }

    const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
            id: true,
            name: true,
            bannerUrl: true,
            logoUrl: true,
            createdAt: true,
            status: true as any,
            deletedAt: true as any,
            hardDeleteAfter: true as any,
        } as any,
    })
    if (!profile) return { error: 'Profile không tồn tại.' }

    return {
        success: true as const,
        profile: profile as any,
        callerRole: role,
    }
}

/**
 * [Sprint Z+1] Owner update profile name + banner + logo.
 */
export async function updateProfileSettings(
    profileId: string,
    data: { name?: string; bannerUrl?: string | null; logoUrl?: string | null; portalAccent?: string | null },
) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Bạn cần đăng nhập.' }

    const { getProfileRole, isSessionLive } = await import('@/lib/profile-permissions')
    // [AUDIT MISS-3 — fix] Reject a LOCKED / force-logged-out OWNER (stale JWT) on this
    // getSession()-only self-tenant mutation (mirror SI-1 / MISS-2 liveness gate).
    if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
    const role = await getProfileRole(session.user.id, profileId)
    if (role !== 'OWNER') return { error: 'Chỉ Owner mới có quyền cập nhật Profile.' }

    const updateData: any = {}
    if (data.name !== undefined) {
        const trimmed = data.name.trim()
        if (!trimmed) return { error: 'Tên Profile không được để trống.' }
        if (trimmed.length > 50) return { error: 'Tên Profile không được quá 50 ký tự.' }
        updateData.name = trimmed
    }
    if (data.bannerUrl !== undefined) updateData.bannerUrl = data.bannerUrl ?? null
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl ?? null

    // [Trial P3 — white-label] Portal accent lives in the settings JSON; MERGE so
    // other settings keys survive. Validate #RGB / #RRGGBB, else clear the key.
    if (data.portalAccent !== undefined) {
        const cur = await prisma.profile.findUnique({ where: { id: profileId }, select: { settings: true } })
        const base: Record<string, unknown> =
            cur?.settings && typeof cur.settings === 'object' && !Array.isArray(cur.settings)
                ? { ...(cur.settings as Record<string, unknown>) }
                : {}
        const raw = (data.portalAccent ?? '').trim()
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) base.portalAccent = raw
        else delete base.portalAccent
        updateData.settings = base
    }

    if (Object.keys(updateData).length === 0) {
        return { error: 'Không có thay đổi nào.' }
    }

    const updated = await prisma.profile.update({
        where: { id: profileId },
        data: updateData,
        select: { id: true, name: true, bannerUrl: true, logoUrl: true },
    })

    const { audit } = await import('@/lib/audit-log')
    await audit({
        workspaceId: 'SYSTEM',
        actorUserId: session.user.id,
        action: 'profile.updated' as any,
        targetType: 'Profile',
        targetId: profileId,
        after: updateData,
    })

    revalidatePath('/', 'layout')
    return { success: true as const, profile: updated }
}

/**
 * [Sprint Z+1] Owner soft-delete profile. 30-day grace period, then cron
 * hard-deletes (cascade workspaces/tasks/members).
 */
export async function deleteProfileAction(profileId: string) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Bạn cần đăng nhập.' }

    const { getProfileRole, isSessionLive } = await import('@/lib/profile-permissions')
    // [AUDIT MISS-3 — fix] Reject a LOCKED / force-logged-out OWNER (stale JWT) before a
    // destructive self-tenant soft-delete (mirror SI-1 / MISS-2 liveness gate).
    if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
    const role = await getProfileRole(session.user.id, profileId)
    if (role !== 'OWNER') return { error: 'Chỉ Owner mới có quyền xóa Profile.' }

    const hardDeleteAfter = new Date(Date.now() + PROFILE_HARD_DELETE_GRACE_DAYS * 24 * 3600 * 1000)

    try {
        await prisma.profile.update({
            where: { id: profileId },
            data: {
                status: 'SOFT_DELETED',
                deletedAt: new Date(),
                hardDeleteAfter,
            } as any,
        })

        const { audit } = await import('@/lib/audit-log')
        await audit({
            workspaceId: 'SYSTEM',
            actorUserId: session.user.id,
            action: 'profile.soft_deleted' as any,
            targetType: 'Profile',
            targetId: profileId,
            after: { hardDeleteAfter: hardDeleteAfter.toISOString() },
        })

        revalidatePath('/', 'layout')
        return { success: true as const, hardDeleteAfter: hardDeleteAfter.toISOString() }
    } catch (e: any) {
        console.error('deleteProfileAction error:', e)
        return { error: 'Không thể xóa Profile. Vui lòng thử lại.' }
    }
}

/**
 * [Sprint Z+1] Restore soft-deleted profile within 30-day window.
 */
export async function restoreProfileAction(profileId: string) {
    const session = await getSession()
    if (!session?.user?.id) return { error: 'Bạn cần đăng nhập.' }

    const { getProfileRole, isSessionLive } = await import('@/lib/profile-permissions')
    // [AUDIT MISS-3 — fix] Reject a LOCKED / force-logged-out OWNER (stale JWT) on this
    // getSession()-only self-tenant mutation (mirror SI-1 / MISS-2 liveness gate).
    if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
    const role = await getProfileRole(session.user.id, profileId)
    if (role !== 'OWNER') return { error: 'Chỉ Owner mới có quyền khôi phục Profile.' }

    try {
        await prisma.profile.update({
            where: { id: profileId },
            data: {
                status: 'ACTIVE',
                deletedAt: null,
                hardDeleteAfter: null,
            } as any,
        })

        const { audit } = await import('@/lib/audit-log')
        await audit({
            workspaceId: 'SYSTEM',
            actorUserId: session.user.id,
            action: 'profile.restored' as any,
            targetType: 'Profile',
            targetId: profileId,
        })

        revalidatePath('/', 'layout')
        return { success: true as const }
    } catch (e: any) {
        console.error('restoreProfileAction error:', e)
        return { error: 'Không thể khôi phục Profile.' }
    }
}

/**
 * [Sprint Z+1] List soft-deleted profiles user owns (for Trash page).
 */
export async function getMyTrashedProfiles() {
    const session = await getSession()
    if (!session?.user?.id) return { profiles: [] }

    const accesses = await prisma.profileAccess.findMany({
        where: {
            userId: session.user.id,
            role: 'OWNER',
            profile: { status: 'SOFT_DELETED' as any } as any,
        },
        select: {
            profile: {
                select: {
                    id: true,
                    name: true,
                    deletedAt: true as any,
                    hardDeleteAfter: true as any,
                } as any,
            },
        },
    })

    return {
        profiles: accesses.map((a: any) => {
            const p = a.profile
            return {
                id: p.id,
                name: p.name,
                deletedAt: p.deletedAt?.toISOString?.() ?? null,
                hardDeleteAfter: p.hardDeleteAfter?.toISOString?.() ?? null,
                daysUntilHardDelete: p.hardDeleteAfter
                    ? Math.max(0, Math.ceil((p.hardDeleteAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                    : 0,
            }
        }),
    }
}

export async function changePassword(userId: string, currentPass: string, newPass: string, workspaceId: string) {
    try {
        // [AUDIT R3 — fix] Was operating on the client-supplied userId with no session
        // requirement (mirror of the updateProfile hole). Bind to the caller's own
        // account; the client-supplied userId is ignored.
        const session = await getSession()
        if (!session?.user?.id) return { error: 'Unauthorized' }
        // [AUDIT HT-033 fix] Đổi mật khẩu là đường ghi thông tin đăng nhập. Tài khoản đã bị khoá
        // hoặc phiên đã bị thu hồi (chính "đăng xuất mọi thiết bị" / đặt lại mật khẩu bump
        // sessionVersion) không được phép đặt lại mật khẩu bằng token cũ.
        const { isSessionLive } = await import('@/lib/profile-permissions')
        if (!(await isSessionLive(session))) return { error: 'Phiên đăng nhập đã hết hiệu lực hoặc tài khoản đã bị khóa.' }
        const targetId = session.user.id

        // [AUDIT R14 — fix] Refuse credential changes inside an impersonation session — the
        // session principal is the impersonated victim, so this would change THEIR password
        // (a silent takeover that survives the impersonation TTL).
        if ((session.user as any).isImpersonating) {
            return { error: 'Không thể đổi mật khẩu khi đang ở phiên impersonation.' }
        }

        const user = await prisma.user.findUnique({
            where: { id: targetId }
        })

        if (!user) {
            return { error: 'User not found' }
        }

        // [Google OAuth] Tài khoản đăng nhập bằng Google chưa có mật khẩu →
        // không có mật khẩu cũ để xác minh. Hướng dẫn đặt qua luồng "Quên mật khẩu".
        if (!user.password) {
            return { error: 'Tài khoản này đăng nhập bằng Google. Dùng "Quên mật khẩu" để đặt mật khẩu lần đầu.' }
        }

        // Verify old password
        const isValid = await compare(currentPass, user.password)
        if (!isValid) {
            return { error: 'Mật khẩu hiện tại không đúng' }
        }

        // Hash new password
        const hashedPassword = await hash(newPass, 12)

        // [AUDIT R4 — BLOCKER fix] The R3 patch rebound the READ+verify to targetId but
        // left this WRITE pointed at the untrusted `userId` param → the current-password
        // check ran against the CALLER's row while the new hash landed on the victim
        // (account takeover). Bind the write to the authenticated caller.
        // [AUDIT R14 — fix] Bump sessionVersion so every OTHER outstanding JWT for this
        // account is revoked (a password change must evict other devices — the public reset
        // + email-migration flows already do this), then re-issue THIS caller's cookie with
        // the new version so they aren't immediately logged out.
        const updated = await prisma.user.update({
            where: { id: targetId },
            data: {
                password: hashedPassword,
                sessionVersion: { increment: 1 },
            },
            select: { sessionVersion: true },
        })
        await login({ ...(session.user as any), sessionVersion: updated.sessionVersion })

        await audit({
            workspaceId,
            actorUserId: targetId,
            action: 'auth.password_changed',
            targetType: 'User',
            targetId,
        })

        revalidatePath(`/${workspaceId}/dashboard/profile`)

        return { success: true }
    } catch (error) {
        return { error: 'Failed to change password' }
    }
}
