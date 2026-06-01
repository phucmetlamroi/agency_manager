'use server'

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { revalidatePath } from 'next/cache'

/**
 * Knowledge Hub — Wiki (Notion-style page tree, content stored as Tiptap HTML).
 * Page hierarchy is modelled relationally (self-referencing parentId); content
 * is a single HTML document per page (no per-block rows). Workspace MEMBERs can
 * read + edit (collaborative internal docs); last-write-wins autosave.
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

async function resolveProfileId(workspaceId: string, user: unknown): Promise<string | null> {
    const fromSession = (user as { sessionProfileId?: string })?.sessionProfileId
    if (fromSession) return fromSession
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { profileId: true } })
    return ws?.profileId ?? null
}

export async function getWikiTree(workspaceId: string): Promise<{ pages: WikiTreeNode[] }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const pages = await prisma.wikiPage.findMany({
        where: { workspaceId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: TREE_SELECT,
    })
    return { pages }
}

export async function getWikiPage(
    workspaceId: string,
    pageId: string,
): Promise<{ page: WikiPageDTO } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const page = await prisma.wikiPage.findFirst({ where: { id: pageId, workspaceId }, select: PAGE_SELECT })
    if (!page) return { error: 'Không tìm thấy trang' }
    return { page }
}

export async function createWikiPage(
    workspaceId: string,
    input: { title?: string; parentId?: string | null },
): Promise<{ page: WikiPageDTO } | { error: string }> {
    const { user, userId } = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const profileId = await resolveProfileId(workspaceId, user)
    if (!profileId) return { error: 'Workspace chưa gắn profile' }

    let parentId: string | null = null
    if (input.parentId) {
        const parent = await prisma.wikiPage.findFirst({ where: { id: input.parentId, workspaceId }, select: { id: true } })
        parentId = parent?.id ?? null
    }

    const position = await prisma.wikiPage.count({ where: { workspaceId, parentId } })
    const page = await prisma.wikiPage.create({
        data: {
            workspaceId,
            profileId,
            authorId: userId,
            title: (input.title?.trim() || 'Trang mới').slice(0, 120),
            content: '',
            parentId,
            position,
        },
        select: PAGE_SELECT,
    })
    revalidatePath(`/${workspaceId}/admin/wiki`)
    return { page }
}

export async function updateWikiPage(
    workspaceId: string,
    pageId: string,
    data: { title?: string; content?: string; icon?: string | null },
): Promise<{ success: true } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const exists = await prisma.wikiPage.findFirst({ where: { id: pageId, workspaceId }, select: { id: true } })
    if (!exists) return { error: 'Không tìm thấy trang' }

    const patch: { title?: string; content?: string; icon?: string | null } = {}
    if (typeof data.title === 'string') patch.title = data.title.trim().slice(0, 120) || 'Trang mới'
    if (typeof data.content === 'string') patch.content = data.content
    if (data.icon !== undefined) patch.icon = data.icon

    await prisma.wikiPage.update({ where: { id: pageId }, data: patch })
    return { success: true }
}

export async function deleteWikiPage(
    workspaceId: string,
    pageId: string,
): Promise<{ success: true } | { error: string }> {
    await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    // Children become root pages via onDelete: SetNull on the self-relation.
    await prisma.wikiPage.deleteMany({ where: { id: pageId, workspaceId } })
    revalidatePath(`/${workspaceId}/admin/wiki`)
    return { success: true }
}
