'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { hasAtLeastRole } from '@/lib/workspace-roles'
import { visibleChannelWhere } from '@/lib/channel-permissions'
import { revalidatePath } from 'next/cache'
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
} as const

/** Resolve a concrete profileId for create rows (session → workspace fallback). */
async function resolveProfileId(workspaceId: string, user: unknown): Promise<string | null> {
    const fromSession = (user as { sessionProfileId?: string })?.sessionProfileId
    if (fromSession) return fromSession
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    return ws?.profileId ?? null
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

    const [categories, channels] = await Promise.all([
        prisma.category.findMany({
            where: { workspaceId },
            orderBy: { position: 'asc' },
            select: { id: true, name: true, position: true },
        }),
        prisma.channel.findMany({
            // Standalone hub channels only — TASK channels live inside task detail.
            where: { workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] }, ...visibleChannelWhere(userId, isAdmin) },
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
    revalidatePath(`/${workspaceId}/admin/hub`)
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
    const { user, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
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
            visibility: input.visibility ?? 'PUBLIC',
            postPolicy: input.postPolicy ?? 'EVERYONE',
            position,
        },
        select: CHANNEL_SELECT,
    })
    revalidatePath(`/${workspaceId}/admin/hub`)
    return { success: true, channel }
}

export async function renameChannel(workspaceId: string, channelId: string, name: string) {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }
    const clean = name.trim()
    if (!clean) return { error: 'Tên không được để trống' }

    // updateMany + explicit workspaceId → cannot touch other workspaces.
    await prisma.channel.updateMany({ where: { id: channelId, workspaceId }, data: { name: clean.slice(0, 80) } })
    revalidatePath(`/${workspaceId}/admin/hub`)
    return { success: true }
}

export async function deleteChannel(workspaceId: string, channelId: string) {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }

    // Only standalone hub channels deletable here (never a TASK channel).
    await prisma.channel.deleteMany({ where: { id: channelId, workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] } } })
    revalidatePath(`/${workspaceId}/admin/hub`)
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
}
export interface WorkspaceMemberOption {
    id: string
    username: string
    displayName: string | null
}

export async function updateChannelSettings(
    workspaceId: string,
    channelId: string,
    input: { visibility?: ChannelVisibility; postPolicy?: PostPolicy },
) {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }

    const data: { visibility?: ChannelVisibility; postPolicy?: PostPolicy } = {}
    if (input.visibility) data.visibility = input.visibility
    if (input.postPolicy) data.postPolicy = input.postPolicy
    if (Object.keys(data).length === 0) return { success: true }

    // Never alter a TASK channel's nature.
    await prisma.channel.updateMany({
        where: { id: channelId, workspaceId, type: { in: ['TEXT', 'FORUM', 'WIKI'] } },
        data,
    })
    revalidatePath(`/${workspaceId}/admin/hub`)
    return { success: true }
}

export async function getChannelAccess(
    workspaceId: string,
    channelId: string,
): Promise<{ members: ChannelMemberDTO[]; workspaceMembers: WorkspaceMemberOption[] } | { error: string }> {
    const { workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }

    const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true } })
    if (!channel) return { error: 'Không tìm thấy kênh' }

    const [members, wsMembers] = await Promise.all([
        prisma.channelMember.findMany({
            where: { channelId },
            select: { userId: true, role: true, user: { select: { username: true, displayName: true } } },
        }),
        prisma.workspaceMember.findMany({
            where: { workspaceId },
            select: { user: { select: { id: true, username: true, displayName: true } } },
            orderBy: { joinedAt: 'asc' },
        }),
    ])

    return {
        members: members.map((m) => ({ userId: m.userId, role: m.role, username: m.user.username, displayName: m.user.displayName })),
        workspaceMembers: wsMembers.map((w) => ({ id: w.user.id, username: w.user.username, displayName: w.user.displayName })),
    }
}

export async function setChannelMembers(workspaceId: string, channelId: string, userIds: string[]) {
    const { user, workspaceRole } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    if (!hasAtLeastRole(workspaceRole, 'ADMIN')) return { error: 'Không có quyền' }

    const channel = await prisma.channel.findFirst({ where: { id: channelId, workspaceId }, select: { id: true } })
    if (!channel) return { error: 'Không tìm thấy kênh' }
    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    // Only real workspace members may be added.
    const valid = await prisma.workspaceMember.findMany({
        where: { workspaceId, userId: { in: userIds } },
        select: { userId: true },
    })
    const target = new Set(valid.map((v) => v.userId))
    const existing = await prisma.channelMember.findMany({ where: { channelId }, select: { userId: true } })
    const existingIds = new Set(existing.map((e) => e.userId))
    const toAdd = Array.from(target).filter((id) => !existingIds.has(id))
    const toRemove = Array.from(existingIds).filter((id) => !target.has(id))

    await prisma.$transaction([
        ...(toRemove.length ? [prisma.channelMember.deleteMany({ where: { channelId, userId: { in: toRemove } } })] : []),
        ...toAdd.map((userId) => prisma.channelMember.create({ data: { workspaceId, profileId, channelId, userId, role: 'MEMBER' } })),
    ])
    revalidatePath(`/${workspaceId}/admin/hub`)
    return { success: true }
}
