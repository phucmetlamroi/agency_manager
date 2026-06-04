'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { authorizeChannel } from '@/lib/channel-permissions'
import { revalidatePath } from 'next/cache'

/**
 * Chat — Wiki (Notion-style page tree, content stored as Tiptap HTML). A WikiPage is:
 *   - **channel-scoped** (`channelId` set): a page inside a WIKI-type Chat channel —
 *     access follows that channel's membership via `authorizeChannel` (VIEW to read,
 *     POST to create/edit, MANAGE to delete). This is the model going forward.
 *   - **standalone** (`channelId` null): legacy workspace-level docs reached from
 *     `/admin/wiki` (workspace MEMBER). The backfill migrates these into a "Docs"
 *     WIKI channel; afterwards this path is effectively empty.
 * Last-write-wins autosave.
 */

export interface WikiTreeNode {
    id: string
    title: string
    icon: string | null
    parentId: string | null
    position: number
}
export interface WikiPageDTO {
    id: string
    title: string
    icon: string | null
    content: string
    parentId: string | null
}

const TREE_SELECT = { id: true, title: true, icon: true, parentId: true, position: true } as const
const PAGE_SELECT = { id: true, title: true, icon: true, content: true, parentId: true } as const

async function resolveProfileId(workspaceId: string, sessionProfileId: string | null): Promise<string | null> {
    if (sessionProfileId) return sessionProfileId
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    return ws?.profileId ?? null
}

export async function getWikiTree(workspaceId: string, channelId?: string | null): Promise<{ pages: WikiTreeNode[] }> {
    if (channelId) {
        try {
            await authorizeChannel(workspaceId, channelId, 'VIEW')
        } catch {
            return { pages: [] }
        }
    } else {
        await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    }
    const pages = await prisma.wikiPage.findMany({
        where: { workspaceId, channelId: channelId ?? null },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: TREE_SELECT,
    })
    return { pages }
}

export async function getWikiPage(workspaceId: string, pageId: string): Promise<{ page: WikiPageDTO } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const row = await prisma.wikiPage.findFirst({ where: { id: pageId, workspaceId }, select: { ...PAGE_SELECT, channelId: true } })
    if (!row) return { error: 'Không tìm thấy trang' }
    if (row.channelId) {
        try {
            await authorizeChannel(workspaceId, row.channelId, 'VIEW')
        } catch {
            return { error: 'Bạn không có quyền xem trang này' }
        }
    }
    const { channelId: _channelId, ...page } = row
    return { page }
}

export async function createWikiPage(
    workspaceId: string,
    input: { title?: string; parentId?: string | null; channelId?: string | null },
): Promise<{ page: WikiPageDTO } | { error: string }> {
    const channelId = input.channelId ?? null
    let userId: string
    let profileId: string | null

    if (channelId) {
        let ctx
        try {
            ctx = await authorizeChannel(workspaceId, channelId, 'POST')
        } catch {
            return { error: 'Bạn không có quyền tạo trang trong kênh này' }
        }
        const ch = await prisma.channel.findFirst({ where: { id: channelId, workspaceId, type: 'WIKI' }, select: { id: true } })
        if (!ch) return { error: 'Kênh không hợp lệ' }
        userId = ctx.userId
        profileId = ctx.profileId
    } else {
        const a = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
        userId = a.userId
        profileId = (a.user as { sessionProfileId?: string })?.sessionProfileId ?? null
    }
    profileId = await resolveProfileId(workspaceId, profileId)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    let parentId: string | null = null
    if (input.parentId) {
        const parent = await prisma.wikiPage.findFirst({ where: { id: input.parentId, workspaceId, channelId }, select: { id: true } })
        parentId = parent?.id ?? null
    }

    const position = await prisma.wikiPage.count({ where: { workspaceId, channelId, parentId } })
    const page = await prisma.wikiPage.create({
        data: {
            workspaceId,
            profileId,
            channelId,
            authorId: userId,
            title: (input.title?.trim() || 'Trang mới').slice(0, 120),
            content: '',
            parentId,
            position,
        },
        select: PAGE_SELECT,
    })
    revalidatePath(`/${workspaceId}/hub`)
    return { page }
}

export async function updateWikiPage(
    workspaceId: string,
    pageId: string,
    data: { title?: string; content?: string; icon?: string | null },
): Promise<{ success: true } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const row = await prisma.wikiPage.findFirst({ where: { id: pageId, workspaceId }, select: { id: true, channelId: true } })
    if (!row) return { error: 'Không tìm thấy trang' }
    if (row.channelId) {
        try {
            await authorizeChannel(workspaceId, row.channelId, 'POST')
        } catch {
            return { error: 'Bạn không có quyền sửa trang này' }
        }
    }

    const patch: { title?: string; content?: string; icon?: string | null } = {}
    if (typeof data.title === 'string') patch.title = data.title.trim().slice(0, 120) || 'Trang mới'
    if (typeof data.content === 'string') patch.content = data.content
    if (data.icon !== undefined) patch.icon = data.icon

    await prisma.wikiPage.updateMany({ where: { id: pageId, workspaceId }, data: patch })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}

export async function deleteWikiPage(workspaceId: string, pageId: string): Promise<{ success: true } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const row = await prisma.wikiPage.findFirst({ where: { id: pageId, workspaceId }, select: { id: true, channelId: true } })
    if (!row) return { success: true }
    if (row.channelId) {
        try {
            await authorizeChannel(workspaceId, row.channelId, 'MANAGE')
        } catch {
            return { error: 'Bạn không có quyền xoá trang này' }
        }
    }
    // Children become root pages via onDelete: SetNull on the self-relation.
    await prisma.wikiPage.deleteMany({ where: { id: pageId, workspaceId } })
    revalidatePath(`/${workspaceId}/hub`)
    return { success: true }
}
