/**
 * Workspace-scoped roles. These mirror the values stored in `WorkspaceMember.role`
 * (currently a `String` column in Prisma — see `prisma/schema.prisma`). The DB
 * column will be migrated to a Postgres enum in a future phase; until then this
 * TS helper provides compile-time safety for code that compares roles.
 *
 * Hierarchy: OWNER > ADMIN > MEMBER > GUEST
 */

export const WORKSPACE_ROLES = ['OWNER', 'ADMIN', 'MEMBER', 'GUEST'] as const

export type WorkspaceRole = typeof WORKSPACE_ROLES[number]

/** Numeric weight for role comparison. Higher = more privileged. */
const ROLE_WEIGHT: Record<WorkspaceRole, number> = {
    OWNER: 4,
    ADMIN: 3,
    MEMBER: 2,
    GUEST: 1,
}

/**
 * Returns true if `actual` role is at least as privileged as `required`.
 * Example: hasAtLeastRole('OWNER', 'ADMIN') === true
 *          hasAtLeastRole('MEMBER', 'ADMIN') === false
 */
export function hasAtLeastRole(actual: string | null | undefined, required: WorkspaceRole): boolean {
    if (!actual) return false
    if (!isWorkspaceRole(actual)) return false
    return ROLE_WEIGHT[actual] >= ROLE_WEIGHT[required]
}

/** Type guard. */
export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
    return typeof value === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(value)
}

/** Roles that can administer the workspace (manage members, settings, billing). */
export const ADMIN_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN']

/** Roles that can write task data. */
export const WRITER_ROLES: WorkspaceRole[] = ['OWNER', 'ADMIN', 'MEMBER']
