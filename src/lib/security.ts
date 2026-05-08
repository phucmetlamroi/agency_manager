import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { UserRole } from '@prisma/client'
import { hasAtLeastRole, isWorkspaceRole, type WorkspaceRole } from '@/lib/workspace-roles'

/**
 * Mức độ đỏ (Critical Security Check): Hàm kiểm tra chéo (Cross-check) chống BOLA/IDOR.
 * Đảm bảo rằng Session ID hiện tại thực sự có quyền truy cập vào WorkspaceID đang được thao tác.
 * Tránh việc User F12 đổi thông số workspaceId để phá hoại team khác.
 *
 * @param workspaceId - The workspace being accessed (from URL/body — UNTRUSTED).
 * @param requiredRole - Minimum WorkspaceRole required. Default 'MEMBER' (just verify membership).
 *                      Use 'ADMIN' for management actions, 'OWNER' for destructive/billing actions.
 */
export async function verifyWorkspaceAccess(
    workspaceId: string,
    requiredRole: WorkspaceRole = 'MEMBER'
): Promise<{
    session: NonNullable<Awaited<ReturnType<typeof getSession>>>
    user: NonNullable<NonNullable<Awaited<ReturnType<typeof getSession>>>['user']>
    userId: string
    workspaceRole: WorkspaceRole
    isGlobalAdmin: boolean
}> {
    const session = await getSession()

    if (!session || !session.user || !session.user.id) {
        throw new Error('SECURITY_VIOLATION: Unauthorized. No valid session.')
    }

    const userId = session.user.id

    // REAL-TIME DB CHECK: Fetch genuine role, bypassing stateless JWT
    const dbUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, isTreasurer: true, avatarUrl: true }
    })

    if (!dbUser || dbUser.role === 'LOCKED') {
        throw new Error('SECURITY_VIOLATION: Tài khoản đã bị khóa hoặc không tồn tại.')
    }

    const globalRole = dbUser.role

    // Global ADMINs (hoặc Treasurer) có quyền ghi/đọc tất cả.
    const isGlobalAdmin = globalRole === UserRole.ADMIN || dbUser.isTreasurer

    // Nếu không phải Global Admin, BẮT BUỘC phải check trong bảng WorkspaceMember
    let workspaceRole: WorkspaceRole = 'MEMBER'

    if (!isGlobalAdmin) {
        const membership = await prisma.workspaceMember.findUnique({
            where: {
                userId_workspaceId: {
                    userId: userId,
                    workspaceId: workspaceId
                }
            }
        })

        if (!membership) {
            console.error(`[SECURITY] User ${userId} attempted to access unauthorized workspace ${workspaceId}`)
            throw new Error('SECURITY_VIOLATION: Bạn không có quyền truy cập vào Workspace này (IDOR Blocked).')
        }

        // Membership.role is `String` in DB; coerce to WorkspaceRole or throw.
        if (!isWorkspaceRole(membership.role)) {
            console.error(`[SECURITY] Workspace ${workspaceId} member ${userId} has invalid role: ${membership.role}`)
            throw new Error('SECURITY_VIOLATION: Vai trò không hợp lệ trong Workspace này.')
        }
        workspaceRole = membership.role

        if (!hasAtLeastRole(workspaceRole, requiredRole)) {
            console.error(`[SECURITY] User ${userId} role=${workspaceRole} required=${requiredRole} on workspace ${workspaceId}`)
            throw new Error('SECURITY_VIOLATION: Bạn không có đủ quyền cho hành động này tại Workspace.')
        }
    } else {
        workspaceRole = 'ADMIN' // Global admins get local admin privileges
    }

    return {
        session,
        user: session.user,
        userId: session.user.id,
        workspaceRole,
        isGlobalAdmin
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
export async function verifyActiveSession() {
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
    const tokenVersion = (session.user as any).sessionVersion ?? 0
    const dbVersion = dbUser.sessionVersion ?? 0
    if (tokenVersion < dbVersion) {
        return { status: 'locked', session: null, dbUser: null, isAdmin: false }
    }

    return {
        status: 'active',
        session,
        dbUser,
        isAdmin: dbUser.role === 'ADMIN' || dbUser.isTreasurer
    }
}
