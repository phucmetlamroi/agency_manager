/**
 * [Sprint Z+1] DEPRECATED — workspace-level OWNER concept removed.
 *
 * Profile Owner is implicit OWNER of all workspaces (via verifyWorkspaceAccess).
 * No need to protect "last OWNER" at workspace level — Profile guarantees
 * exactly 1 OWNER per profile via ProfileAccess constraints + UI flow.
 *
 * Functions kept as no-op (no-throw) để backward-compat caller cũ không break
 * build. Sẽ remove entirely trong sprint sau khi grep verify 0 callers.
 */

export class LastOwnerProtectionError extends Error {
    code = 'CANNOT_REMOVE_LAST_OWNER' as const
    constructor(
        message = 'Không thể thực hiện: đây là OWNER duy nhất của Workspace. Hãy chuyển quyền sở hữu trước.',
    ) {
        super(message)
        this.name = 'LastOwnerProtectionError'
    }
}

/**
 * [Sprint Z+1] No-op. Workspace OWNER concept removed; Profile OWNER (1 per profile)
 * is the new constraint enforced at ProfileAccess level.
 */
export async function ensureNotLastOwner(_workspaceId: string, _userId: string): Promise<void> {
    return
}

/**
 * [Sprint Z+1] No-op alias for backward-compat.
 */
export const ensureNotLastOwnerOnDemotion = ensureNotLastOwner

/**
 * [Sprint Z+1] Always returns false — no workspace-level OWNER concept.
 */
export async function isLastOwner(_workspaceId: string, _userId: string): Promise<boolean> {
    return false
}
