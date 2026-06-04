import { prisma } from '@/lib/db'

export interface LandingResult {
    /** Target workspace id to redirect to (null nếu profile không có workspace) */
    workspaceId: string | null
    /** Target view: 'admin' (OWNER/ADMIN) · 'dashboard' (staff member) · 'portal' (CLIENT membership) */
    view: 'admin' | 'dashboard' | 'portal'
}

const ROLE_PRIORITY: Record<string, number> = {
    OWNER: 4,
    ADMIN: 3,
    MEMBER: 2,
    GUEST: 1,
}

/**
 * Quyết định landing workspace + view sau khi user switch sang profile mới.
 *
 * Logic:
 *   1. Global admin → first workspace, admin view
 *   2. Otherwise scan all workspaces của profile, query user's WorkspaceMember role per ws
 *   3. Sort by role priority (OWNER > ADMIN > MEMBER > GUEST > nonmember)
 *   4. Pick top → return its id + view='admin' if OWNER/ADMIN, else 'dashboard'
 *
 * "Admin của profile" defined as user có WorkspaceMember.role ∈ {OWNER, ADMIN}
 * ở ít nhất 1 workspace trong profile (per user-confirmed spec).
 */
export async function determineLandingForProfile(
    userId: string,
    profileId: string,
    isGlobalAdmin: boolean,
): Promise<LandingResult> {
    // [Client membership] CLIENT membership in this profile → view-only portal.
    const clientAccess = await prisma.profileAccess.findUnique({
        where: { userId_profileId: { userId, profileId } },
        select: { role: true },
    })
    if (clientAccess?.role === 'CLIENT') {
        const ws = await prisma.workspace.findFirst({
            where: { profileId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        })
        return { workspaceId: ws?.id ?? null, view: 'portal' }
    }

    if (isGlobalAdmin) {
        const ws = await prisma.workspace.findFirst({
            where: { profileId },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
        })
        return { workspaceId: ws?.id ?? null, view: 'admin' }
    }

    const workspaces = await prisma.workspace.findMany({
        where: { profileId },
        orderBy: { createdAt: 'desc' },
        select: {
            id: true,
            members: {
                where: { userId },
                select: { role: true },
                take: 1,
            },
        },
    })

    if (workspaces.length === 0) {
        return { workspaceId: null, view: 'dashboard' }
    }

    const ranked = workspaces
        .map((ws) => {
            const role = ws.members[0]?.role ?? null
            const priority = role ? ROLE_PRIORITY[role] ?? 0 : 0
            return { id: ws.id, role, priority }
        })
        .sort((a, b) => b.priority - a.priority)

    const top = ranked[0]
    const view: 'admin' | 'dashboard' =
        top.role === 'OWNER' || top.role === 'ADMIN' ? 'admin' : 'dashboard'

    return { workspaceId: top.id, view }
}
