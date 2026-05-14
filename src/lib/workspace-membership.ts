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
        return true
    } catch (e: any) {
        // P2002 unique constraint — race condition, treat as success
        if (e?.code !== 'P2002') {
            console.warn(`[ensureWorkspaceMembership] failed for user=${userId} ws=${workspaceId}:`, e?.message)
        }
        return false
    }
}
