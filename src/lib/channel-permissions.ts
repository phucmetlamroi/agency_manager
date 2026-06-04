import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { hasAtLeastRole } from '@/lib/workspace-roles'
import type { ChannelVisibility, PostPolicy, ChannelRole, ProfileRole, ChannelType } from '@prisma/client'

/**
 * Knowledge Hub — channel authorization (simplified Discord model).
 *
 * Layered, default-deny, evaluated server-side (the security guarantee — client
 * hiding is UX only):
 *   1. Workspace role (verifyWorkspaceAccess): OWNER/ADMIN bypass everything.
 *   2. Channel base: visibility (PUBLIC/PRIVATE) governs VIEW; postPolicy
 *      (EVERYONE/ADMINS_ONLY) governs POST.
 *   3. ChannelMember.role (MEMBER/MODERATOR): MODERATOR can POST in ADMINS_ONLY
 *      channels and MANAGE the channel.
 *
 * The full Discord-style ALLOW/DENY overwrite matrix is intentionally deferred —
 * this covers the two needed cases: "admins post / everyone reads"
 * (postPolicy=ADMINS_ONLY) and "private channel" (visibility=PRIVATE + members).
 */

export type ChannelAction = 'VIEW' | 'POST' | 'MANAGE'

interface ChannelGate {
    type: string
    postPolicy: PostPolicy
    createdById: string | null
}

/**
 * [Hub member-based] Pure decision function (unit-testable, no I/O).
 * Membership-based for EVERYONE — there is no workspace-admin bypass. A standalone
 * channel is visible only to its members (creator/owner + people added). The
 * creator (`createdById`) and MODERATORs have MANAGE rights.
 * @param userId the caller; @param channelMemberRole their ChannelMember.role, or null.
 */
export function canPerformChannelAction(args: {
    action: ChannelAction
    channel: ChannelGate
    userId: string
    channelMemberRole: ChannelRole | string | null
}): boolean {
    const { action, channel, userId, channelMemberRole } = args

    // TASK channels = per-task chat, NOT Hub channels. Any workspace MEMBER (already
    // MEMBER-verified by authorizeChannel) may view/post; they never appear in the Hub
    // sidebar (getHubData filters type in TEXT/FORUM/WIKI). No settings to MANAGE.
    if (channel.type === 'TASK') {
        return action === 'VIEW' || action === 'POST'
    }

    const isOwner = channel.createdById != null && userId === channel.createdById
    const isOwnerOrMod = isOwner || channelMemberRole === 'MODERATOR'
    const isMember = channelMemberRole != null

    switch (action) {
        case 'VIEW':
            return isMember
        case 'MANAGE':
            return isOwnerOrMod
        case 'POST':
            if (!isMember) return false
            if (channel.postPolicy === 'ADMINS_ONLY') return isOwnerOrMod
            return true
        default:
            return false
    }
}

/** A channel overwrite row (allow/deny are CSV action sets, e.g. "VIEW,POST"). */
export interface ChannelOverwriteRow {
    subjectType: string // 'ROLE' | 'USER'
    subjectId: string
    allow: string
    deny: string
}

function csvHas(csv: string, action: ChannelAction): boolean {
    return csv.length > 0 && csv.split(',').includes(action)
}

/**
 * [Phase 2] Apply per-channel ALLOW/DENY overwrites on top of the membership base.
 * Precedence (low→high): base(membership) → role overwrites → user overwrite; within
 * each level deny is applied then allow. No overwrites → base unchanged (== pre-Phase-2).
 */
export function applyChannelOverwrites(
    base: boolean,
    action: ChannelAction,
    overwrites: ChannelOverwriteRow[],
    userId: string,
    userRoleIds: Set<string>,
): boolean {
    let allowed = base
    let roleDeny = false
    let roleAllow = false
    for (const ow of overwrites) {
        if (ow.subjectType === 'ROLE' && userRoleIds.has(ow.subjectId)) {
            if (csvHas(ow.deny, action)) roleDeny = true
            if (csvHas(ow.allow, action)) roleAllow = true
        }
    }
    if (roleDeny) allowed = false
    if (roleAllow) allowed = true
    for (const ow of overwrites) {
        if (ow.subjectType === 'USER' && ow.subjectId === userId) {
            if (csvHas(ow.deny, action)) allowed = false
            if (csvHas(ow.allow, action)) allowed = true
        }
    }
    return allowed
}

/** All CustomRole ids the user holds in a workspace (overwrite resolution + visibility). */
export async function getUserRoleIds(workspaceId: string, userId: string): Promise<string[]> {
    const rows = await prisma.customRoleMember.findMany({ where: { workspaceId, userId }, select: { roleId: true } })
    return rows.map((r) => r.roleId)
}

export interface ChannelAuthzContext {
    userId: string
    /** Active profile from the session (for getWorkspacePrisma create injection). */
    profileId: string | null
    workspaceRole: string
    profileRole: ProfileRole | null
    isWorkspaceAdmin: boolean
    channel: { id: string; visibility: ChannelVisibility; postPolicy: PostPolicy; type: string; taskId: string | null; createdById: string | null }
    channelMemberRole: ChannelRole | null
}

/**
 * Verify the caller may perform `action` on `channelId` within `workspaceId`.
 * Throws Error('SECURITY_VIOLATION: …') on any failure (caller maps to 403).
 * Returns the resolved authz context on success.
 */
export async function authorizeChannel(
    workspaceId: string,
    channelId: string,
    action: ChannelAction,
): Promise<ChannelAuthzContext> {
    // 1. Must be at least a workspace MEMBER (also runs BOLA/IDOR checks).
    const { user, userId, workspaceRole, profileRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const isWorkspaceAdmin = hasAtLeastRole(workspaceRole, 'ADMIN')
    const profileId = ((user as { sessionProfileId?: string }).sessionProfileId) ?? null

    // 2. Load the channel scoped to this workspace (explicit filter — no magic).
    const channel = await prisma.channel.findFirst({
        where: { id: channelId, workspaceId },
        select: { id: true, visibility: true, postPolicy: true, type: true, taskId: true, createdById: true },
    })
    if (!channel) throw new Error('SECURITY_VIOLATION: channel not found in workspace')

    // 3. Channel membership (per-channel role).
    const membership = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { role: true },
    })
    const channelMemberRole = membership?.role ?? null

    // Base = membership model; then refine with per-channel role/user overwrites
    // (no overwrite rows → base unchanged, identical to pre-Phase-2 behaviour).
    const base = canPerformChannelAction({ action, channel, userId, channelMemberRole })
    let allowed = base
    const overwrites = await prisma.channelOverwrite.findMany({
        where: { channelId },
        select: { subjectType: true, subjectId: true, allow: true, deny: true },
    })
    if (overwrites.length > 0) {
        const userRoleIds = new Set(await getUserRoleIds(workspaceId, userId))
        allowed = applyChannelOverwrites(base, action, overwrites, userId, userRoleIds)
    }
    if (!allowed) {
        throw new Error('SECURITY_VIOLATION: channel action not permitted')
    }

    return { userId, profileId, workspaceRole, profileRole, isWorkspaceAdmin, channel, channelMemberRole }
}

/**
 * [Hub member-based] Prisma `where` fragment for listing channels the caller may
 * VIEW: ONLY channels they're a member of (no admin-sees-all, no PUBLIC-everyone).
 * The TASK branch is inert inside getHubData (which filters type in TEXT/FORUM/WIKI)
 * but keeps the helper self-safe for any future caller. Merge into a findMany where.
 */
export function visibleChannelWhere(userId: string, userRoleIds: string[] = []) {
    // NOTE: overwrite actions are exactly VIEW|POST|MANAGE (validated in setChannelOverwrite);
    // none contains "VIEW" as a substring, so `contains:'VIEW'` is a token-exact match. If a new
    // action containing that substring is ever added, switch to an explicit token match here.
    return {
        AND: [
            {
                OR: [
                    { type: 'TASK' as ChannelType },
                    { members: { some: { userId } } },
                    // [Phase 2] a per-user ALLOW VIEW overwrite grants visibility to a non-member.
                    { overwrites: { some: { subjectType: 'USER', subjectId: userId, allow: { contains: 'VIEW' } } } },
                    // a role ALLOW VIEW overwrite grants visibility to everyone holding that role.
                    ...(userRoleIds.length > 0
                        ? [{ overwrites: { some: { subjectType: 'ROLE', subjectId: { in: userRoleIds }, allow: { contains: 'VIEW' } } } }]
                        : []),
                ],
            },
            // A per-user DENY VIEW hides the channel even from a member (the gate also enforces
            // this; excluding it here stops the channel name leaking into the sidebar/search).
            { NOT: { overwrites: { some: { subjectType: 'USER', subjectId: userId, deny: { contains: 'VIEW' } } } } },
        ],
    }
}
