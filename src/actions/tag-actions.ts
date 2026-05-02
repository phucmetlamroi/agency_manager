'use server'

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/auth'
import { UserRole } from '@prisma/client'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'
import { prisma } from '@/lib/db'

const MAX_TAGS_PER_USER = 15

// ─── Get all tags for a user (within a profile) ───────────────
export async function getTagsForUser(workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized', tags: [] }

    const userId = session.user.id
    let profileId = session.user.profileId

    // If profileId is missing in session, try fetching it from the database
    if (!profileId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        profileId = user?.profileId || null
    }

    const tags = await prisma.tagCategory.findMany({
        where: { userId, ...(profileId ? { profileId } : {}) },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, createdAt: true }
    })

    return { tags }
}

// ─── Create a new tag ─────────────────────────────────────────
export async function createTag(name: string, workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const isAdmin = session.user.role === UserRole.ADMIN || session.user.isTreasurer
    if (!isAdmin) return { error: 'Forbidden' }

    const userId = session.user.id
    let profileId = session.user.profileId

    // If profileId is missing in session, try fetching it from the database
    if (!profileId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { profileId: true }
        })
        profileId = user?.profileId || null
    }

    if (!profileId) return { error: 'No profile found' }

    const trimmed = name.trim()
    if (!trimmed) return { error: 'Tag name cannot be empty' }
    if (trimmed.length > 30) return { error: 'Tag name too long (max 30 chars)' }

    // Check max tags
    const count = await prisma.tagCategory.count({ where: { userId } })
    if (count >= MAX_TAGS_PER_USER) {
        return { error: `Đã đạt giới hạn ${MAX_TAGS_PER_USER} tags` }
    }

    // Check duplicate name
    const existing = await prisma.tagCategory.findFirst({
        where: { userId, name: { equals: trimmed, mode: 'insensitive' } }
    })
    if (existing) return { error: 'Tag đã tồn tại' }

    const tag = await prisma.tagCategory.create({
        data: { name: trimmed, profileId, userId },
        select: { id: true, name: true, createdAt: true }
    })

    return { tag }
}

// ─── Update tag name ──────────────────────────────────────────
export async function updateTag(tagId: string, name: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const isAdmin = session.user.role === UserRole.ADMIN || session.user.isTreasurer
    if (!isAdmin) return { error: 'Forbidden' }

    const trimmed = name.trim()
    if (!trimmed) return { error: 'Tag name cannot be empty' }

    const tag = await prisma.tagCategory.findUnique({ where: { id: tagId } })
    if (!tag) return { error: 'Tag not found' }
    if (tag.userId !== session.user.id) return { error: 'Forbidden' }

    const updated = await prisma.tagCategory.update({
        where: { id: tagId },
        data: { name: trimmed },
        select: { id: true, name: true }
    })

    return { tag: updated }
}

// ─── Delete tag ───────────────────────────────────────────────
export async function deleteTag(tagId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const isAdmin = session.user.role === UserRole.ADMIN || session.user.isTreasurer
    if (!isAdmin) return { error: 'Forbidden' }

    const tag = await prisma.tagCategory.findUnique({ where: { id: tagId } })
    if (!tag) return { error: 'Tag not found' }
    if (tag.userId !== session.user.id) return { error: 'Forbidden' }

    // Delete all associated TaskTags first (cascade should handle, but explicit)
    await prisma.tagCategory.delete({ where: { id: tagId } })

    return { success: true }
}

// ─── Set tags on a task ───────────────────────────────────────
export async function setTaskTags(taskId: string, tagCategoryIds: string[], workspaceId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }

    const isAdmin = session.user.role === UserRole.ADMIN || session.user.isTreasurer
    if (!isAdmin) return { error: 'Forbidden' }

    const workspacePrisma = getWorkspacePrisma(workspaceId)

    // Verify task exists
    const task = await workspacePrisma.task.findUnique({ where: { id: taskId } })
    if (!task) return { error: 'Task not found' }

    // Validate that all tagCategoryIds belong to the current user
    if (tagCategoryIds.length > 0) {
        const ownedTags = await prisma.tagCategory.findMany({
            where: { id: { in: tagCategoryIds }, userId: session.user.id }
        })
        if (ownedTags.length !== tagCategoryIds.length) {
            return { error: 'Invalid tag IDs: some tags do not belong to you' }
        }
    }

    // Delete existing tags for this task
    await prisma.taskTag.deleteMany({ where: { taskId } })

    // Create new associations
    if (tagCategoryIds.length > 0) {
        await prisma.taskTag.createMany({
            data: tagCategoryIds.map(tagCategoryId => ({ taskId, tagCategoryId }))
        })
    }

    revalidatePath(`/${workspaceId}/admin`)
    revalidatePath(`/${workspaceId}/dashboard`)

    return { success: true }
}

// ─── Get tags for a task ──────────────────────────────────────
export async function getTaskTags(taskId: string) {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized', tags: [] }

    const tags = await prisma.taskTag.findMany({
        where: { taskId },
        include: { tagCategory: { select: { id: true, name: true } } }
    })

    return { tags: tags.map(t => t.tagCategory) }
}
