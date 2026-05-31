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
