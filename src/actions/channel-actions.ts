'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { hasAtLeastRole } from '@/lib/workspace-roles'
import { visibleChannelWhere, authorizeChannel, getUserRoleIds } from '@/lib/channel-permissions'
import { getWorkspaceStaff, type StaffUser } from '@/lib/workspace-staff'
import { revalidatePath } from 'next/cache'
import { createAndBroadcastNotifications } from '@/actions/notification-actions'
import type { ChannelType, ChannelVisibility, PostPolicy } from '@prisma/client'

/**
 * Knowledge Hub — category + channel management (server actions).
 * All queries are explicitly scoped by workspaceId (server-controlled). Creates/
 * edits are gated to workspace OWNER/ADMIN. Per-message permission lives in
 * message-actions + channel-permissions.authorizeChannel.
 */

export interface HubCategoryDTO {
    id: string
    name: string
    position: number
}
export interface HubChannelDTO {
    id: string
    name: string
    description: string | null
    type: ChannelType
    visibility: ChannelVisibility
    postPolicy: PostPolicy
    categoryId: string | null
    position: number
    slowModeSeconds: number
}

const CHANNEL_SELECT = {
    id: true,
    name: true,
    description: true,
    type: true,
    visibility: true,
    postPolicy: true,
    categoryId: true,
    position: true,
    slowModeSeconds: true,
} as const

/** Resolve a concrete profileId for create rows (session → workspace fallback). */
async function resolveProfileId(workspaceId: string, user: unknown): Promise<string | null> {
    const fromSession = (user as { sessionProfileId?: string })?.sessionProfileId
    if (fromSession) return fromSession
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    return ws?.profileId ?? null
}

/**
 * [Hub member-based] All staff users of a workspace who may be added to a channel =
 * WorkspaceMember(role ADMIN/MEMBER) ∪ profile ProfileAccess(role OWNER/ADMIN/USER).
 * CLIENT + GUEST excluded. This is the addable-members universe for the settings
 * modal — it MUST include profile-level staff (who often have no WorkspaceMember row)
 * so saving membership never silently drops the backfilled members.
 */
async function getWorkspaceStaffOptions(workspaceId: string): Promise<WorkspaceMemberOption[]> {
    // Single source of truth (avoids drift with role management / overwrites).
    return getWorkspaceStaff(workspaceId)
}

/** Sidebar payload: categories + the channels the caller may view. */
export async function getHubData(workspaceId: string): Promise<{
    categories: HubCategoryDTO[]
    channels: HubChannelDTO[]
    isAdmin: boolean
    currentUserId: string
}> {
    const { userId, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const isAdmin = hasAtLeastRole(workspaceRole, 'ADMIN')
    const userRoleIds = await getUserRoleIds(workspaceId, userId)

    const [categories, channels] = await Promise.all([
        prisma.category.findMany({
            where: { workspaceId },
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true },
        }),
        prisma.channel.findMany({
            // Standalone hub channels only — TASK channels live inside task detail.
            where: { workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] }, ...visibleChannelWhere(userId, userRoleIds) },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: CHANNEL_SELECT,
        }),
    ])

    return { categories, channels, isAdmin, currentUserId: userId }
}

export async function createCategory(workspaceId: string, name: string) {
    const { user, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Chỉ admin mới tạo nhóm kênh' }
    const clean = name.trim()
    if (!clean) return { error: 'Tên nhóm không được để trống' }

    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    const position = await prisma.category.count({ where: { workspaceId } })
    const category = await prisma.category.create({
        data: { workspaceId, profileId, name: clean.slice(0, 60), position },
        select: { id: true, name: true, position: true },
    })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true, category }
}

export async function createChannel(
    workspaceId: string,
    input: {
        name: string
        categoryId?: string | null
        type?: ChannelType
        visibility?: ChannelVisibility
        postPolicy?: PostPolicy
    },
) {
    const { user, userId, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Chỉ admin mới tạo kênh' }
    const clean = input.name.trim()
    if (!clean) return { error: 'Tên kênh không được để trống' }

    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    // Validate categoryId belongs to this workspace.
    let categoryId: string | null = null
    if (input.categoryId) {
        const cat = await prisma.category.findFirst({ where: { id: input.categoryId, workspaceId }, select: { id: true } })
        categoryId = cat?.id ?? null
    }

    const position = await prisma.channel.count({ where: { workspaceId } })
    const channel = await prisma.channel.create({
        data: {
            workspaceId,
            profileId,
            name: clean.slice(0, 80),
            categoryId,
            type: input.type ?? 'TEXT',
            // [Hub member-based] access is membership-only now; default PRIVATE (visibility is cosmetic).
            visibility: input.visibility ?? 'PRIVATE',
            postPolicy: input.postPolicy ?? 'EVERYONE',
            position,
            createdById: userId,
            // creator = owner + first member (MODERATOR), else the channel is invisible to everyone incl. them.
            members: { create: { workspaceId, profileId, userId, role: 'MODERATOR' } },
        },
        select: CHANNEL_SELECT,
    })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true, channel }
}

export async function renameChannel(workspaceId: string, channelId: string, name: string) {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }
    const clean = name.trim()
    if (!clean) return { error: 'Tên không được để trống' }

    // updateMany + explicit workspaceId → cannot touch other workspaces.
    await prisma.channel.updateMany({ where: { id: channelId, workspaceId }, data: { name: clean.slice(0, 80) } })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

export async function deleteChannel(workspaceId: string, channelId: string) {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }

    // Only standalone hub channels deletable here (never a TASK channel).
    await prisma.channel.deleteMany({ where: { id: channelId, workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] } } })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

/**
 * [Phase 6] Lazily get-or-create the discussion channel for a task. Callable by
 * any workspace MEMBER (it's the chat for a task they can already open). The
 * `taskId @unique` constraint makes concurrent creation race-safe.
 */
export async function getOrCreateTaskChannel(
    workspaceId: string,
    taskId: string,
): Promise<{ channel: HubChannelDTO } | { error: string }> {
    const { user } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')

    // The task must belong to this workspace.
    const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true } })
    if (!task) return { error: 'Không tìm thấy task' }

    const existing = await prisma.channel.findFirst({ where: { taskId, workspaceId }, select: CHANNEL_SELECT })
    if (existing) return { channel: existing }

    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    try {
        const channel = await prisma.channel.create({
            data: {
                workspaceId,
                profileId,
                taskId,
                name: task.title.trim().slice(0, 80) || 'Thảo luận task',
                type: 'TASK',
                visibility: 'PUBLIC',
                postPolicy: 'EVERYONE',
                position: 0,
            },
            select: CHANNEL_SELECT,
        })
        return { channel }
    } catch {
        // Race: a concurrent open created it first (unique taskId) → refetch.
        const again = await prisma.channel.findFirst({ where: { taskId, workspaceId }, select: CHANNEL_SELECT })
        if (again) return { channel: again }
        return { error: 'Không mở được kênh thảo luận' }
    }
}

/* ─── [Phase 3] Channel settings + private membership (admin-only) ─────────── */

export interface ChannelMemberDTO {
    userId: string
    username: string
    displayName: string | null
    role: string
    /** [ChatP2-5] true if this member is a portal CLIENT user (not internal staff). */
    isClient: boolean
}
export interface WorkspaceMemberOption {
    id: string
    username: string
    displayName: string | null
}
/** [ChatP2-5] Portal CLIENT users belonging to this workspace's profile, addable to TEXT channels. */
export interface WorkspaceClientOption {
    id: string
    username: string
    displayName: string | null
    /** Display label of the linked Client record (or null when not linked). */
    clientName: string | null
}

/**
 * [ChatP2-5] All CLIENT-role portal users for this workspace's profile — the
 * universe of clients a staff manager may invite into a TEXT channel.
 * Scope: ProfileAccess(role=CLIENT) for workspace.profileId. Includes the Client
 * record's name (best display label) when available.
 */
async function getWorkspaceClientOptions(workspaceId: string): Promise<WorkspaceClientOption[]> {
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    if (!ws?.profileId) return []
    const rows = await prisma.profileAccess.findMany({
        where: { profileId: ws.profileId, role: 'CLIENT' },
        select: {
            userId: true,
            clientId: true,
            user: { select: { username: true, displayName: true } },
            client: { select: { name: true, status: true } },
        },
    })
    // Exclude SOFT_DELETED Client records (portal user remains but the client is hidden from staff surfaces).
    return rows
        .filter((r) => !r.client || r.client.status !== 'SOFT_DELETED')
        .map((r) => ({
            id: r.userId,
            username: r.user.username,
            displayName: r.user.displayName,
            clientName: r.client?.name ?? null,
        }))
        // Stable order: client name first, then username, so the list doesn't churn between renders.
        .sort((a, b) => (a.clientName ?? a.username).localeCompare(b.clientName ?? b.username))
}

export async function updateChannelSettings(
    workspaceId: string,
    channelId: string,
    input: { visibility?: ChannelVisibility; postPolicy?: PostPolicy; slowModeSeconds?: number },
) {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }

    const data: { visibility?: ChannelVisibility; postPolicy?: PostPolicy; slowModeSeconds?: number } = {}
    if (input.visibility) data.visibility = input.visibility
    if (input.postPolicy) data.postPolicy = input.postPolicy
    if (typeof input.slowModeSeconds === 'number') data.slowModeSeconds = Math.max(0, Math.min(21600, Math.floor(input.slowModeSeconds)))
    if (Object.keys(data).length === 0) return { success: true }

    // Never alter a TASK channel's nature.
    await prisma.channel.updateMany({
        where: { id: channelId, workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] } },
        data,
    })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

export async function getChannelAccess(
    workspaceId: string,
    channelId: string,
): Promise<{
    members: ChannelMemberDTO[]
    workspaceMembers: WorkspaceMemberOption[]
    /** [ChatP2-5] Portal CLIENT users — empty array for non-TEXT channels (clients are TEXT-only). */
    workspaceClients: WorkspaceClientOption[]
    /** Channel type, so the UI knows whether to render the Khách hàng section (TEXT only). */
    channelType: ChannelType
} | { error: string }> {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }

    const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true, type: true } })
    if (!channel) return { error: 'Không tìm thấy kênh' }

    // Clients are TEXT-only for now — WIKI exposes a doc tree and FORUM a post list,
    // both broader surfaces than the client portal MessageModal can handle safely.
    const allowClients = channel.type === 'TEXT'

    const [members, workspaceMembers, workspaceClients] = await Promise.all([
        prisma.channelMember.findMany({
            where: { channelId },
            select: { userId: true, role: true, user: { select: { username: true, displayName: true } } },
        }),
        getWorkspaceStaffOptions(workspaceId),
        allowClients ? getWorkspaceClientOptions(workspaceId) : Promise.resolve([] as WorkspaceClientOption[]),
    ])

    // Tag each member as staff vs CLIENT — UI shows them in separate groups.
    const clientUserIds = new Set(workspaceClients.map((c) => c.id))
    return {
        members: members.map((m) => ({
            userId: m.userId,
            role: m.role,
            username: m.user.username,
            displayName: m.user.displayName,
            isClient: clientUserIds.has(m.userId),
        })),
        workspaceMembers,
        workspaceClients,
        channelType: channel.type,
    }
}

/**
 * [ChatP2-5] Accepts staff + portal CLIENT user IDs in a single list. The action
 * validates each id against the workspace's staff universe OR its CLIENT-portal
 * universe (ProfileAccess role=CLIENT), then writes a single ChannelMember set.
 * Clients are only accepted on TEXT channels — WIKI/FORUM remain staff-only here.
 */
export async function setChannelMembers(workspaceId: string, channelId: string, userIds: string[]) {
    let ctx: Awaited<ReturnType<typeof authorizeChannel>>
    try {
        ctx = await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }

    const channel = await prisma.channel.findFirst({
        where: { id: channelId, workspaceId },
        select: { id: true, name: true, createdById: true, type: true, clientId: true },
    })
    if (!channel) return { error: 'Không tìm thấy kênh' }
    const profileId = ctx.profileId ?? (await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } }))?.profileId ?? null
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    // Two universes — staff (any channel) + CLIENTs (TEXT-only, this profile only).
    const [staff, clients] = await Promise.all([
        getWorkspaceStaffOptions(workspaceId),
        channel.type === 'TEXT' ? getWorkspaceClientOptions(workspaceId) : Promise.resolve([] as WorkspaceClientOption[]),
    ])
    const staffIds = new Set(staff.map((s) => s.id))
    const clientIds = new Set(clients.map((c) => c.id))

    // Accept ids that are either staff OR CLIENT for this workspace. Unknown ids are dropped silently.
    const target = new Set(userIds.filter((id) => staffIds.has(id) || clientIds.has(id)))
    // The owner can never be removed from their own channel.
    if (channel.createdById) target.add(channel.createdById)
    const existing = await prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } })
    const existingIds = new Set(existing.map((e) => e.userId))
    const toAdd = Array.from(target).filter((id) => !existingIds.has(id))
    const toRemove = Array.from(existingIds).filter((id) => !target.has(id))

    await prisma.$transaction([
        ...(toRemove.length ? [prisma.channelMember.deleteMany({ where: { channelId, userId: { in: toRemove } } })] : []),
        ...toAdd.map((userId) => prisma.channelMember.create({ data: { workspaceId, profileId, channelId, userId, role: 'MEMBER' } })),
    ])
    revalidatePath(`/${workspaceId}/hub`)

    // [nối dây] notify members added / removed (in-app only — these types render no email).
    try {
        if (toAdd.length) {
            await createAndBroadcastNotifications(toAdd, {
                type: 'GROUP_MEMBER_ADDED',
                title: `Bạn được thêm vào #${channel.name}`,
                body: `Bạn vừa được thêm vào kênh "${channel.name}".`,
                actorId: ctx.userId,
                metadata: { channelId, channelName: channel.name },
            })
        }
        if (toRemove.length) {
            await createAndBroadcastNotifications(toRemove, {
                type: 'GROUP_MEMBER_REMOVED',
                title: `Bạn bị gỡ khỏi #${channel.name}`,
                body: `Bạn đã được gỡ khỏi kênh "${channel.name}".`,
                actorId: ctx.userId,
                metadata: { channelId, channelName: channel.name },
            })
        }
    } catch (e) {
        console.error('[setChannelMembers] notify failed', e)
    }

    return { success: true }
}

/**
 * [nối dây] Per-user channel mute. A linked member can silence CHANNEL_MESSAGE
 * fan-out for a noisy channel; their @mentions + thread replies still come through.
 */
export async function getMyChannelMute(
    workspaceId: string,
    channelId: string,
): Promise<{ isMember: boolean; muted: boolean }> {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const row = await prisma.channelMember.findFirst({
        where: { channelId, userId, workspaceId },
        select: { muted: true },
    })
    return { isMember: !!row, muted: row?.muted ?? false }
}

export async function setChannelMuted(
    workspaceId: string,
    channelId: string,
    muted: boolean,
): Promise<{ success: true; muted: boolean } | { error: string }> {
    const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const res = await prisma.channelMember.updateMany({
        where: { channelId, userId, workspaceId },
        data: { muted },
    })
    if (res.count === 0) return { error: 'Bạn không phải thành viên của kênh này.' }
    return { success: true, muted }
}

/**
 * [Hub member-based] Does the caller have MANAGE rights on this channel (owner or
 * MODERATOR)? Drives the ChannelView settings gear + delete-message buttons.
 */
export async function getMyChannelManage(
    workspaceId: string,
    channelId: string,
): Promise<{ canManage: boolean }> {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
        return { canManage: true }
    } catch {
        return { canManage: false }
    }
}

/**
 * [Phase 2 · @-autocomplete] Members eligible to be @-mentioned in a channel =
 * channel members ∪ workspace OWNER/ADMINs (mirrors notifyMentions so the
 * dropdown matches exactly who a mention will reach; PRIVATE non-members excluded).
 */
export async function getChannelMembers(
    workspaceId: string,
    channelId: string,
): Promise<Array<{ id: string; username: string; displayName: string | null; avatarUrl: string | null }>> {
    try {
        await authorizeChannel(workspaceId, channelId, 'VIEW')
        const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true } as const
        // [Hub member-based] @-mention targets = channel members only (matches notifyMentions).
        const chMembers = await prisma.channelMember.findMany({ where: { channelId, workspaceId }, select: { user: { select: USER_SELECT } } })
        const byId = new Map<string, { id: string; username: string; displayName: string | null; avatarUrl: string | null }>()
        for (const m of chMembers) if (m.user) byId.set(m.user.id, m.user)
        return Array.from(byId.values()).sort((a, b) =>
            (a.displayName || a.username).localeCompare(b.displayName || b.username),
        )
    } catch {
        return []
    }
}

/**
 * [Phase 2 · read receipts] Mark a channel read for the caller (advances
 * lastReadAt on their ChannelMember row). Update-only — never creates a
 * membership (that was the access leak); non-members have nothing to advance.
 */
export async function markChannelRead(
    workspaceId: string,
    channelId: string,
): Promise<{ success: true } | { error: string }> {
    try {
        const ctx = await authorizeChannel(workspaceId, channelId, 'VIEW')
        await prisma.channelMember.updateMany({
            where: { channelId, userId: ctx.userId, workspaceId },
            data: { lastReadAt: new Date() },
        })
        return { success: true }
    } catch {
        return { error: 'Lỗi đánh dấu đã đọc.' }
    }
}

/**
 * [Phase 2 · unread badges] Per-channel unread count for the caller — counts
 * top-level, non-deleted messages from OTHERS newer than the caller's lastReadAt,
 * across channels the caller is a member of. Returns only channels with count>0.
 */
export async function getUnreadCounts(workspaceId: string): Promise<Record<string, number>> {
    try {
        const { userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        const memberships = await prisma.channelMember.findMany({
            where: { workspaceId, userId },
            select: { channelId: true, lastReadAt: true },
        })
        const result: Record<string, number> = {}
        await Promise.all(
            memberships.map(async (mem) => {
                const count = await prisma.message.count({
                    where: {
                        channelId: mem.channelId,
                        parentId: null,
                        deletedAt: null,
                        authorId: { not: userId },
                        ...(mem.lastReadAt ? { createdAt: { gt: mem.lastReadAt } } : {}),
                    },
                })
                if (count > 0) result[mem.channelId] = count
            }),
        )
        return result
    } catch {
        return {}
    }
}

/* ─── [Phase 2] Per-channel role/user ALLOW-DENY overwrites (MANAGE-gated) ───── */

export interface ChannelOverwriteDTO {
    subjectType: string // 'ROLE' | 'USER'
    subjectId: string
    subjectName: string
    allow: string[]
    deny: string[]
}

export async function getChannelOverwrites(
    workspaceId: string,
    channelId: string,
): Promise<
    | { overwrites: ChannelOverwriteDTO[]; roles: Array<{ id: string; name: string; color: string | null }>; staff: StaffUser[] }
    | { error: string }
> {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }
    const [rows, roles, staff] = await Promise.all([
        prisma.channelOverwrite.findMany({ where: { channelId, workspaceId }, select: { subjectType: true, subjectId: true, allow: true, deny: true } }),
        prisma.customRole.findMany({ where: { workspaceId }, orderBy: { position: 'asc' }, select: { id: true, name: true, color: true } }),
        getWorkspaceStaff(workspaceId),
    ])
    const roleName = new Map(roles.map((r) => [r.id, r.name]))
    const userName = new Map(staff.map((s) => [s.id, s.displayName || s.username]))
    const overwrites: ChannelOverwriteDTO[] = rows.map((r) => ({
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        subjectName:
            r.subjectType === 'ROLE'
                ? roleName.get(r.subjectId) ?? '(vai trò đã xoá)'
                : userName.get(r.subjectId) ?? r.subjectId,
        allow: r.allow ? r.allow.split(',') : [],
        deny: r.deny ? r.deny.split(',') : [],
    }))
    return { overwrites, roles, staff }
}

export async function setChannelOverwrite(
    workspaceId: string,
    channelId: string,
    subjectType: 'ROLE' | 'USER',
    subjectId: string,
    allow: string[],
    deny: string[],
): Promise<{ success: true } | { error: string }> {
    try {
        await authorizeChannel(workspaceId, channelId, 'MANAGE')
    } catch {
        return { error: 'Không có quyền' }
    }
    const VALID = ['VIEW', 'POST', 'MANAGE']
    const d = Array.from(new Set(deny.filter((x) => VALID.includes(x))))
    const a = Array.from(new Set(allow.filter((x) => VALID.includes(x)))).filter((x) => !d.includes(x)) // deny wins

    if (subjectType === 'ROLE') {
        const r = await prisma.customRole.findFirst({ where: { id: subjectId, workspaceId }, select: { id: true } })
        if (!r) return { error: 'Vai trò không hợp lệ' }
    } else if (subjectType === 'USER') {
        const staffIds = new Set((await getWorkspaceStaff(workspaceId)).map((s) => s.id))
        if (!staffIds.has(subjectId)) return { error: 'Người dùng không hợp lệ' }
    } else {
        return { error: 'Loại không hợp lệ' }
    }

    if (a.length === 0 && d.length === 0) {
        await prisma.channelOverwrite.deleteMany({ where: { channelId, subjectType, subjectId } })
    } else {
        await prisma.channelOverwrite.upsert({
            where: { channelId_subjectType_subjectId: { channelId, subjectType, subjectId } },
            update: { allow: a.join(','), deny: d.join(',') },
            create: { workspaceId, channelId, subjectType, subjectId, allow: a.join(','), deny: d.join(',') },
        })
    }
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}
