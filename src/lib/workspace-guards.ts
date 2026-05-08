import { prisma } from '@/lib/db'

/**
 * Last-admin protection guards.
 *
 * Enforces the spec rule: a workspace MUST have at least one OWNER at all times.
 * Without this, an admin could demote/remove the last OWNER and orphan the
 * workspace (Microsoft Loop-style "no owner" bug → no one can manage members,
 * billing, or delete it).
 *
 * Reference: spec mục 4 "Edge cases — Last admin / OWNER duy nhất"
 */

export class LastOwnerProtectionError extends Error {
    code = 'CANNOT_REMOVE_LAST_OWNER' as const
    constructor(message = 'Không thể thực hiện: đây là OWNER duy nhất của Workspace. Hãy chuyển quyền sở hữu trước.') {
        super(message)
        this.name = 'LastOwnerProtectionError'
    }
}

/**
 * Throws `LastOwnerProtectionError` if removing/demoting `userId` would leave
 * the workspace with zero OWNERs.
 *
 * Use BEFORE: removing a member, demoting OWNER → ADMIN/MEMBER/GUEST,
 * processing a self-leave, or deleting a user account that owns workspaces.
 *
 * Note: this is a check-then-mutate pattern → race conditions exist (two
 * concurrent demotions could both pass the check). For Phase 2 we will add
 * a DB-level CHECK constraint via Postgres trigger. For Phase 1 the race
 * window is acceptable given low admin churn.
 */
export async function ensureNotLastOwner(workspaceId: string, userId: string): Promise<void> {
    // Is the target currently an OWNER?
    const target = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: {
                userId,
                workspaceId,
            },
        },
        select: { role: true },
    })

    // Not an OWNER → no protection needed
    if (!target || target.role !== 'OWNER') return

    // Count active OWNERs of this workspace
    const ownerCount = await prisma.workspaceMember.count({
        where: {
            workspaceId,
            role: 'OWNER',
        },
    })

    if (ownerCount <= 1) {
        throw new LastOwnerProtectionError()
    }
}

/**
 * Same as ensureNotLastOwner but for the case where we're DEMOTING (changing
 * role away from OWNER). Identical logic — provided as an alias for clarity
 * at call sites.
 */
export const ensureNotLastOwnerOnDemotion = ensureNotLastOwner

/**
 * Returns true if the user is currently the only OWNER of the workspace.
 * Useful for UI hints (e.g. disable a "Leave" button for the sole owner).
 */
export async function isLastOwner(workspaceId: string, userId: string): Promise<boolean> {
    const target = await prisma.workspaceMember.findUnique({
        where: {
            userId_workspaceId: { userId, workspaceId },
        },
        select: { role: true },
    })
    if (!target || target.role !== 'OWNER') return false

    const ownerCount = await prisma.workspaceMember.count({
        where: { workspaceId, role: 'OWNER' },
    })
    return ownerCount <= 1
}
