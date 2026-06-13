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
