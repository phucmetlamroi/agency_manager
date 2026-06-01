import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { hasAtLeastRole } from '@/lib/workspace-roles'
import type { ChannelVisibility, PostPolicy, ChannelRole, ProfileRole } from '@prisma/client'

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
    visibility: ChannelVisibility
    postPolicy: PostPolicy
}

/**
 * Pure decision function (unit-testable, no I/O).
 * @param channelMemberRole the caller's ChannelMember.role, or null if not a member.
 */
export function canPerformChannelAction(args: {
    action: ChannelAction
    channel: ChannelGate
    isWorkspaceAdmin: boolean
    channelMemberRole: ChannelRole | string | null
}): boolean {
    const { action, channel, isWorkspaceAdmin, channelMemberRole } = args

    // Workspace OWNER/ADMIN bypass all channel rules.
    if (isWorkspaceAdmin) return true

    const isModerator = channelMemberRole === 'MODERATOR'
    const isMember = channelMemberRole != null
    const canView = channel.visibility === 'PUBLIC' || isMember

    switch (action) {
        case 'VIEW':
            return canView
        case 'MANAGE':
            // Non-admins can only manage if they're a channel MODERATOR.
            return isModerator
        case 'POST':
            if (!canView) return false
            if (channel.postPolicy === 'ADMINS_ONLY') return isModerator
            return true
        default:
            return false
    }
}

export interface ChannelAuthzContext {
    userId: string
    /** Active profile from the session (for getWorkspacePrisma create injection). */
    profileId: string | null
    workspaceRole: string
    profileRole: ProfileRole | null
    isWorkspaceAdmin: boolean
    channel: { id: string; visibility: ChannelVisibility; postPolicy: PostPolicy; type: string; taskId: string | null }
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
        select: { id: true, visibility: true, postPolicy: true, type: true, taskId: true },
    })
    if (!channel) throw new Error('SECURITY_VIOLATION: channel not found in workspace')

    // 3. Channel membership (per-channel role / private access).
    const membership = await prisma.channelMember.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { role: true },
    })
    const channelMemberRole = membership?.role ?? null

    if (!canPerformChannelAction({ action, channel, isWorkspaceAdmin, channelMemberRole })) {
        throw new Error('SECURITY_VIOLATION: channel action not permitted')
    }

    return { userId, profileId, workspaceRole, profileRole, isWorkspaceAdmin, channel, channelMemberRole }
}

/**
 * Prisma `where` fragment for listing channels the caller may VIEW.
 * Admins see all; others see PUBLIC channels + PRIVATE channels they belong to.
 * Merge into a findMany where (the workspaceId scope is applied separately).
 */
export function visibleChannelWhere(userId: string, isWorkspaceAdmin: boolean) {
    if (isWorkspaceAdmin) return {}
    return {
        OR: [{ visibility: 'PUBLIC' as ChannelVisibility }, { members: { some: { userId } } }],
    }
}
