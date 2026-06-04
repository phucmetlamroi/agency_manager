import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { ProfileRole } from '@prisma/client'
import { hasAtLeastRole, isWorkspaceRole, type WorkspaceRole } from '@/lib/workspace-roles'
import { cache } from 'react'

/**
 * [Perf] Request-scoped cache for workspace membership lookups.
 * Both layout.tsx and page-level verifyWorkspaceAccess() query the same
 * WorkspaceMember row during a single navigation — this deduplicates it.
 */
export const getWorkspaceMembership = cache(
    async (userId: string, workspaceId: string) => {
        return prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { role: true },
        })
    }
)

/**
 * [Sprint Z] BOLA/IDOR protection — verify caller có quyền access workspaceId.
 *
 * Access logic (post super-admin removal — SaaS multi-tenant model):
 *   1. Profile OWNER → workspaceRole = OWNER (full access tất cả workspaces của profile)
 *   2. Profile ADMIN + workspace.createdAt >= grantedAt → workspaceRole = ADMIN
 *      (Admin chỉ thấy workspace tạo sau khi họ được promote/added)
 *   3. Explicit WorkspaceMember row → dùng role của row đó (Owner cấp cho Admin
 *      truy cập workspace cũ; User được invite vào workspace cụ thể)
 *   4. Else → reject (SECURITY_VIOLATION)
 *
 * KHÔNG còn isGlobalAdmin bypass — mọi user phải có ProfileAccess hoặc WorkspaceMember
 * explicit. Treasurer flag không còn override workspace access.
 *
 * @param workspaceId - The workspace being accessed (from URL/body — UNTRUSTED).
 * @param requiredRole - Minimum WorkspaceRole required. Default 'MEMBER'.
 */
export async function verifyWorkspaceAccess(
    workspaceId: string,
    requiredRole: WorkspaceRole = 'MEMBER'
): Promise<{
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>
    user: NonNullable<NonNullable<Awaited<ReturnType<typeof getSession>>>['user']>
    userId: string
    workspaceRole: WorkspaceRole
    /** [Sprint Z] Profile-level role (OWNER/ADMIN/USER) — null nếu không có ProfileAccess */
    profileRole: ProfileRole | null
    /**
     * @deprecated [Sprint Z] Always false — super admin model removed. Kept for
     * backward-compat with old callers; will remove in Sprint Z+1.
     */
    isGlobalAdmin: boolean
}> {
    const session = await getSession()

    if (!session || !session.user || !session.user.id) {
        throw new Error('SECURITY_VIOLATION: Unauthorized. No valid session.')
    }

    const userId = session.user.id

    // REAL-TIME DB CHECK: account active?
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, avatarUrl: true }
    })
    if (!dbUser || dbUser.role === 'LOCKED') {
        throw new Error('SECURITY_VIOLATION: Tài khoản đã bị khóa hoặc không tồn tại.')
    }

    // Get workspace + its profile
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true, createdAt: true }
    })
    if (!workspace) {
        throw new Error('SECURITY_VIOLATION: Workspace không tồn tại.')
    }

    // Profile-level role check (Sprint Z primary path)
    let profileAccess: { role: ProfileRole; grantedAt: Date } | null = null
    if (workspace.profileId) {
        profileAccess = await prisma.profileAccess.findUnique({
            where: { userId_profileId: { userId, profileId: workspace.profileId } },
            select: { role: true, grantedAt: true }
        })
    }

    let workspaceRole: WorkspaceRole | null = null

    if (profileAccess?.role === 'OWNER') {
        // Profile OWNER → workspace OWNER implicit (full access tất cả workspaces)
        workspaceRole = 'OWNER'
    } else if (profileAccess?.role === 'ADMIN' && workspace.createdAt >= profileAccess.grantedAt) {
        // Profile ADMIN: chỉ workspace tạo SAU khi họ được promote/granted
        workspaceRole = 'ADMIN'
    } else {
        // Fall through: explicit WorkspaceMember row (for old workspaces granted
        // by Owner to specific Admin/User)
        // [Perf] Uses cached helper — same row may already be fetched by layout.
        const membership = await getWorkspaceMembership(userId, workspaceId)

        if (membership) {
            if (!isWorkspaceRole(membership.role)) {
                console.error(`[SECURITY] Workspace ${workspaceId} member ${userId} has invalid role: ${membership.role}`)
                throw new Error('SECURITY_VIOLATION: Vai trò không hợp lệ trong Workspace này.')
            }
            workspaceRole = membership.role
        } else if (profileAccess && profileAccess.role !== 'CLIENT') {
            // [Client membership] CLIENT profile members are EXCLUDED here — they are
            // view-only portal users and must never receive internal MEMBER access.
            // [Sprint Z+1 hotfix] Profile member (USER, hoặc ADMIN với workspace cũ hơn grantedAt)
            // → fall back tới MEMBER access. Cần thiết cho USER assigned to task —
            // họ cần permission update productLink/notes khi nộp delivery.
            //
            // CREATE gates (workspace creation, member invite, role change) đều dùng
            // canCreateWorkspace/canInviteMember từ profile-permissions.ts (based on
            // ProfileAccess.role), KHÔNG dựa workspaceRole — nên fallback này SAFE.
            workspaceRole = 'MEMBER'
        }
    }

    if (!workspaceRole) {
        console.error(`[SECURITY] User ${userId} attempted to access workspace ${workspaceId} (profile=${workspace.profileId}) without permission`)
        throw new Error('SECURITY_VIOLATION: Bạn không có quyền truy cập vào Workspace này (IDOR Blocked).')
    }

    if (!hasAtLeastRole(workspaceRole, requiredRole)) {
        console.error(`[SECURITY] User ${userId} role=${workspaceRole} required=${requiredRole} on workspace ${workspaceId}`)
        throw new Error('SECURITY_VIOLATION: Bạn không có đủ quyền cho hành động này tại Workspace.')
    }

    return {
        session,
        user: session.user,
        userId: session.user.id,
        workspaceRole,
        profileRole: profileAccess?.role ?? null,
        // [Sprint Z] Backward-compat: isGlobalAdmin always false. Old callers
        // that check `if (isGlobalAdmin)` will fall through to explicit checks.
        isGlobalAdmin: false
    }
}

/**
 * Kiểm tra Session chống lưu Cookie cũ chưa hết hạn (Session Fixation Block).
 * Hàm này dùng để đảm bảo mỗi khi gọi data, user chưa bị Locked bởi Admin.
 *
 * Auth Phase 1: Cũng kiểm tra `sessionVersion` — nếu JWT có version cũ hơn DB
 * (do user reset password / "logout tất cả thiết bị") → reject session.
 * Đây là defense-in-depth chống CVE-2025-29927 (middleware bypass).
 */
export const verifyActiveSession = cache(async function verifyActiveSession() {
    const session = await getSession()
    if (!session || !session.user || !session.user.id) {
        return { status: 'unauthorized', session: null, dbUser: null, isAdmin: false }
    }

    // Hit DB để check role hiện hành, đề phòng bị Ban hôm qua nhưng Cookie vẫn còn sống 7 ngày.
    const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
            role: true,
            id: true,
            isTreasurer: true,
            username: true,
            avatarUrl: true,
            // Auth Phase 1 fields
            sessionVersion: true,
            emailVerified: true,
            hasCompletedEmailMigration: true,
            displayName: true,
            email: true,
        }
    })

    if (!dbUser || dbUser.role === 'LOCKED') {
        return { status: 'locked', session: null, dbUser: null, isAdmin: false }
    }

    // Defense-in-depth: nếu JWT có sessionVersion thấp hơn DB → JWT cũ → reject.
    // Trường hợp: user reset password hoặc "logout tất cả thiết bị" → bump dbUser.sessionVersion.
    // JWT cũ có version cũ → mọi request từ JWT đó bị reject ngay tại DAL.
    //
    // MEDIUM #9 fix: coerce null/undefined sessionVersion sang 0 — legacy users
    // không có DB sessionVersion vẫn enforce check. Schema default là 0 nên
    // legacy users sau migration đã có sessionVersion=0; defensive coercion ở đây
    // để chắc chắn.
    //
    // Audit fix #4.1: Log warning nếu detect null sessionVersion ở JWT —
    // báo hiệu legacy session từ trước Auth Phase 1, hoặc bug somewhere không
    // set claim này. Log để observability biết khi nào safe để remove fallback.
    const rawTokenVersion = (session.user as any).sessionVersion
    const rawDbVersion = dbUser.sessionVersion
    if (rawTokenVersion == null) {
        console.warn(`[security] Legacy session detected: user ${dbUser.id} (${dbUser.username}) has JWT without sessionVersion. Force re-login recommended.`)
    }
    if (rawDbVersion == null) {
        console.warn(`[security] DB sessionVersion is null for user ${dbUser.id} — should be 0 by default. Check migration.`)
    }
    const tokenVersion = rawTokenVersion ?? 0
    const dbVersion = rawDbVersion ?? 0
    if (tokenVersion < dbVersion) {
        return { status: 'locked', session: null, dbUser: null, isAdmin: false }
    }

    return {
        status: 'active',
        session,
        dbUser,
        // [Sprint Z] isAdmin chỉ còn = isTreasurer (financial role).
        // User.role='ADMIN' super-admin pattern bị remove — không còn bypass.
        // Callers cần dùng profile-permissions helpers để check workspace/profile access.
        isAdmin: !!dbUser.isTreasurer
    }
})
