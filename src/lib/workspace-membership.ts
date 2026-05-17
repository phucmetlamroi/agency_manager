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
