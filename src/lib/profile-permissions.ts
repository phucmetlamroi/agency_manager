import { prisma } from '@/lib/db'
import type { ProfileRole } from '@prisma/client'

/**
 * [Sprint Z] Full RBAC API cho profile-level permissions.
 *
 * Permission matrix:
 *   | Action                       | OWNER | ADMIN | USER |
 *   |------------------------------|-------|-------|------|
 *   | Tạo workspace                | ✅    | ✅    | ❌   |
 *   | Mời member vào profile       | ✅    | ✅    | ❌   |
 *   | Xóa member khỏi profile      | ✅    | ❌    | ❌   |
 *   | Promote/demote role          | ✅    | ❌    | ❌   |
 *   | Transfer ownership           | ✅    | ❌    | ❌   |
 *
 * Workspace access:
 *   - OWNER: thấy tất cả workspaces của profile
 *   - ADMIN: chỉ workspaces createdAt >= grantedAt (cutoff). Workspace cũ → cần WorkspaceMember row Owner cấp.
 *   - USER: chỉ workspaces có explicit WorkspaceMember row
 *
 * Không có super admin. Mỗi profile là 1 tenant độc lập (SaaS model).
 */

export async function getProfileRole(userId: string, profileId: string): Promise<ProfileRole | null> {
    if (!userId || !profileId) return null
    const access = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId, profileId } },
        select: { role: true },
    })
    return access?.role ?? null
}

/**
 * [AUDIT SI-1 / SI-2 / MISS-2 — fix] Liveness re-check for mutation / PII-read doors that
 * authenticate via getSession() alone (JWT decrypt) and never reach verifyWorkspaceAccess —
 * the canonical profile-member-actions.ts surface and cross-team-actions.ts.
 *
 * getSession() (auth.ts) deliberately skips the sessionVersion check (Edge-cheap), and the
 * permission predicates here only read ProfileAccess.role — they never read User.role or
 * User.sessionVersion. So without this helper a LOCKED (banned) account, or a session revoked
 * by "logout all devices" / password-reset (which bumps User.sessionVersion), could still
 * invite / remove / transfer / approve-du-học with a stale token. Mirrors the guard
 * acceptWorkspaceInvitation already applies (member-actions.ts) and verifyWorkspaceAccess
 * (security.ts). Returns true only if the account is live and the token is current.
 */
export async function isSessionLive(session: { user?: { id?: string; sessionVersion?: number } } | null): Promise<boolean> {
    const uid = session?.user?.id
    if (!uid) return false
    const dbUser = await prisma.user.findUnique({
        where: { id: uid },
        select: { role: true, sessionVersion: true },
    })
    if (!dbUser || dbUser.role === 'LOCKED') return false
    if (((session?.user?.sessionVersion) ?? 0) < (dbUser.sessionVersion ?? 0)) return false
    return true
}

export async function getProfileAccess(
    userId: string,
    profileId: string,
): Promise<{ role: ProfileRole; grantedAt: Date } | null> {
    if (!userId || !profileId) return null
    return prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId, profileId } },
        select: { role: true, grantedAt: true },
    })
}

/* ── Permission predicates ──────────────────────────────────────── */

export async function canCreateWorkspace(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER' || role === 'ADMIN'
}

export async function canInviteMember(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER' || role === 'ADMIN'
}

/**
 * [Canonical Clients] Who can create/revoke public client share links.
 * User requirement: "chỉ có admin của profile mới có quyền share link, không
 * đưa được lung tung" → profile OWNER + ADMIN only (same bar as inviting
 * members). USER/CLIENT roles can never mint or kill a public link.
 */
export async function canManageShareLinks(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER' || role === 'ADMIN'
}

export async function canRemoveMember(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER'
}

export async function canChangeMemberRole(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER'
}

export async function canTransferOwnership(userId: string, profileId: string): Promise<boolean> {
    const role = await getProfileRole(userId, profileId)
    return role === 'OWNER'
}

/* ── Workspace access (with grantedAt cutoff for ADMIN) ─────────── */

/**
 * Combined workspace access check.
 *
 * Logic:
 * - OWNER → full access (any workspace of profile)
 * - ADMIN + workspace.createdAt >= grantedAt → auto access
 * - ADMIN + workspace.createdAt < grantedAt → fall through to WorkspaceMember
 * - USER → must have explicit WorkspaceMember row
 */
export async function canAccessWorkspace(userId: string, workspaceId: string): Promise<boolean> {
    if (!userId || !workspaceId) return false

    const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { profileId: true, createdAt: true },
    })
    if (!ws?.profileId) return false

    const access = await getProfileAccess(userId, ws.profileId)
    // [Client membership] CLIENT = view-only portal, never internal workspace access.
    if (access?.role === 'CLIENT') return false
    if (access?.role === 'OWNER') return true
    if (access?.role === 'ADMIN' && ws.createdAt >= access.grantedAt) return true

    // Fall through: explicit WorkspaceMember row required (granted by Owner for old workspaces)
    const member = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { id: true },
    })
    return !!member
}

/**
 * Compatibility shim — old binary `isProfileOwner` semantic.
 * @deprecated [Sprint Z] Use getProfileRole or canCreateWorkspace instead.
 *   Kept for Sprint Y callers chưa migrate.
 */
export async function isProfileOwner(userId: string, profileId: string): Promise<boolean> {
    return canCreateWorkspace(userId, profileId)
}
