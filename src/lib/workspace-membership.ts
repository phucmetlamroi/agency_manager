import { prisma } from '@/lib/db'

/**
 * [Sprint Z+1 hotfix] Ensure user has WorkspaceMember row in given workspace.
 *
 * Use case: when admin assigns task to user (or user claims from marketplace),
 * user needs WorkspaceMember row to access the workspace. Sprint Z removed
 * "same profile = auto-MEMBER" fallback in verifyWorkspaceAccess → assignees
 * without explicit row bị block khi update task.
 *
 * Call this AFTER successful task.create/update với assigneeId set.
 *
 * Idempotent: upsert pattern. Won't override existing role (e.g. don't downgrade
 * an OWNER—already converted to ADMIN—to MEMBER).
 *
 * [Z+1.fix5] Also ensures ProfileAccess exists for workspace's profile.
 * Without this, user is "a member" but INVISIBLE in profile-scoped queries
 * (admin page users list, assignee dropdown, etc.) — the "orphan membership" bug.
 *
 * @returns true if row was created, false if already existed
 */
/**
 * [AUDIT R14 — fix] True if `userId` already belongs to the workspace's PROFILE — a
 * native member (User.profileId), a ProfileAccess holder, or a WorkspaceMember row.
 * Gate assigneeId on this BEFORE createTask/assignTask provisions it via
 * ensureWorkspaceMembership (which upserts a ProfileAccess for any global userId, an
 * unsanctioned cross-tenant member-injection primitive). A user with NO profile
 * affiliation at all is also rejected — net-new people must come through the gated
 * invite flow, not task assignment.
 */
export async function isAssigneeInWorkspaceProfile(
    userId: string,
    workspaceId: string,
    profileId?: string | null,
): Promise<boolean> {
    if (!userId || !workspaceId) return false
    let pid = profileId ?? null
    if (!pid) {
        const ws = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { profileId: true },
        })
        pid = ws?.profileId ?? null
    }
    const [user, member, access] = await Promise.all([
        prisma.user.findUnique({ where: { id: userId }, select: { profileId: true } }),
        prisma.workspaceMember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { role: true },
        }),
        pid
            ? prisma.profileAccess.findUnique({
                  where: { userId_profileId: { userId, profileId: pid } },
                  select: { role: true },
              })
            : Promise.resolve(null),
    ])
    if (!user) return false
    return (!!pid && user.profileId === pid) || !!member || !!access
}

export async function ensureWorkspaceMembership(
    userId: string,
    workspaceId: string,
    defaultRole: 'MEMBER' | 'ADMIN' = 'MEMBER',
): Promise<boolean> {
    if (!userId || !workspaceId) return false

    const existing = await prisma.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { id: true },
    })

    if (existing) return false

    try {
        await prisma.workspaceMember.create({
            data: { userId, workspaceId, role: defaultRole },
        })

        // [Z+1.fix5] Also ensure ProfileAccess exists for workspace's profile.
        // Without this, user has WorkspaceMember but is INVISIBLE in all
        // profile-scoped queries (workspacePrisma.user.findMany filters by
        // profileId OR profileAccesses). This caused the "orphan membership" bug
        // where inviteToWorkspace sees existingMember but admin page doesn't
        // show user in assignee dropdown.
        try {
            const ws = await prisma.workspace.findUnique({
                where: { id: workspaceId },
                select: { profileId: true },
            })
            if (ws?.profileId) {
                await prisma.profileAccess.upsert({
                    where: { userId_profileId: { userId, profileId: ws.profileId } },
                    create: { userId, profileId: ws.profileId, role: 'USER' },
                    update: {},  // don't override existing role (OWNER/ADMIN stays)
                })
            }
        } catch (paErr: any) {
            // Non-fatal — WorkspaceMember was created successfully.
            // ProfileAccess creation is best-effort (race condition P2002 OK).
            if (paErr?.code !== 'P2002') {
                console.warn(`[ensureWorkspaceMembership] ProfileAccess upsert failed for user=${userId} ws=${workspaceId}:`, paErr?.message)
            }
        }

        return true
    } catch (e: any) {
        // P2002 unique constraint — race condition, treat as success
        if (e?.code !== 'P2002') {
            console.warn(`[ensureWorkspaceMembership] failed for user=${userId} ws=${workspaceId}:`, e?.message)
        }
        return false
    }
}
