'use server'

/**
 * [Trial P1] Staff (session-gated) actions for ClickUp-style TASK comments — the
 * right column of the task drawer. Staff see EVERY comment (INTERNAL + CLIENT);
 * the token client portal has its own hard-filtered path (share-portal-actions).
 * The feed merges TaskComment rows with mapped AuditLog activity, time-sorted.
 */

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { sanitizeClientText, FEEDBACK_MAX_LEN } from '@/lib/sanitize'
import { audit } from '@/lib/audit-log'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { isValidReaction } from '@/lib/comment-reactions'
import { revalidatePath } from 'next/cache'

export interface CommentReactionAgg {
    emoji: string
    count: number
    /** The current viewer already reacted with this emoji. */
    mine: boolean
}

export interface TaskFeedItem {
    kind: 'comment' | 'event'
    id: string
    authorName: string
    authorType?: 'STAFF' | 'CLIENT'
    visibility?: 'INTERNAL' | 'CLIENT'
    body?: string
    label?: string
    mentions?: string[]
    createdAt: string
    editedAt?: string | null
    /** [P3] null = top-level; else the id of the comment this replies to. */
    parentId?: string | null
    /** [P3] Aggregated emoji reactions on this comment. */
    reactions?: CommentReactionAgg[]
    /** The signed-in staff member authored this (drives edit/delete affordance). */
    isMine?: boolean
    /** May delete (own comment, or admin). */
    canManage?: boolean
}

// Task audit actions → human labels for the staff feed (Vietnamese; staff UI).
const EVENT_LABELS: Record<string, string> = {
    'task.assigned': 'đã tạo / giao task',
    'task.started': 'bắt đầu làm',
    'task.delivered': 'đã nộp sản phẩm',
    'task.completed': 'đánh dấu hoàn tất',
    'task.client_approved': 'khách đã duyệt',
    'task.client_changes_requested': 'khách yêu cầu chỉnh sửa',
    'task.bulk_status_updated': 'đổi trạng thái',
    'request.accepted': 'nhận từ yêu cầu của khách',
}

/** Parse @username tokens from the body → workspace-member userIds (unknown handles ignored). */
async function resolveMentions(body: string, workspaceId: string): Promise<string[]> {
    const handles = Array.from(new Set((body.match(/@([a-zA-Z0-9_.\-]+)/g) || []).map((h) => h.slice(1).toLowerCase())))
    if (!handles.length) return []
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { user: { select: { id: true, username: true } } },
    })
    const byName = new Map(members.map((m) => [m.user.username.toLowerCase(), m.user.id]))
    return handles.map((h) => byName.get(h)).filter((x): x is string => !!x)
}

async function staffCtx(workspaceId: string): Promise<{ userId: string; isAdmin: boolean }> {
    const access = await verifyWorkspaceAccess(workspaceId, 'MEMBER')
    const isAdmin =
        access.workspaceRole === 'OWNER' || access.workspaceRole === 'ADMIN' ||
        access.profileRole === 'OWNER' || access.profileRole === 'ADMIN'
    return { userId: access.userId, isAdmin }
}

async function taskInWorkspace(taskId: string, workspaceId: string) {
    return prisma.task.findFirst({ where: { id: taskId, workspaceId }, select: { id: true, title: true, assignedById: true } })
}

/** Merged, time-ordered feed (comments + activity) for the admin/editor drawer. */
export async function getTaskActivityFeed(taskId: string, workspaceId: string): Promise<TaskFeedItem[]> {
    const { userId, isAdmin } = await staffCtx(workspaceId)
    if (!(await taskInWorkspace(taskId, workspaceId))) return []

    const [comments, events] = await Promise.all([
        prisma.taskComment.findMany({ where: { taskId, isDeleted: false }, orderBy: { createdAt: 'asc' } }),
        prisma.auditLog.findMany({
            where: { targetType: 'Task', targetId: taskId, action: { in: Object.keys(EVENT_LABELS) } },
            orderBy: { createdAt: 'asc' }, take: 100,
        }),
    ])

    // [P3] Aggregate reactions per comment (mine = this staff user reacted).
    const commentIds = comments.map((c) => c.id)
    const reactions = commentIds.length
        ? await prisma.taskCommentReaction.findMany({ where: { commentId: { in: commentIds } }, select: { commentId: true, emoji: true, userId: true } })
        : []
    const reactionsByComment = new Map<string, CommentReactionAgg[]>()
    for (const r of reactions) {
        const arr = reactionsByComment.get(r.commentId) || []
        const existing = arr.find((a) => a.emoji === r.emoji)
        if (existing) { existing.count++; if (r.userId === userId) existing.mine = true }
        else arr.push({ emoji: r.emoji, count: 1, mine: r.userId === userId })
        reactionsByComment.set(r.commentId, arr)
    }

    const staffIds = Array.from(new Set([
        ...comments.filter((c) => c.authorUserId).map((c) => c.authorUserId!),
        ...events.map((e) => e.actorUserId).filter((x): x is string => !!x),
    ]))
    const clientIds = Array.from(new Set(comments.filter((c) => c.clientId != null).map((c) => c.clientId!)))
    const [staff, clients] = await Promise.all([
        staffIds.length ? prisma.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, username: true, nickname: true } }) : [],
        clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [],
    ])
    const staffName = new Map(staff.map((u) => [u.id, u.nickname || u.username]))
    const clientName = new Map(clients.map((c) => [c.id, c.name]))

    const commentItems: TaskFeedItem[] = comments.map((c) => ({
        kind: 'comment',
        id: c.id,
        authorType: c.authorType === 'CLIENT' ? 'CLIENT' : 'STAFF',
        authorName: c.authorType === 'CLIENT'
            ? (c.clientId != null ? clientName.get(c.clientId) || 'Khách hàng' : 'Khách hàng')
            : (c.authorUserId ? staffName.get(c.authorUserId) || 'Nhân viên' : 'Nhân viên'),
        visibility: c.visibility as 'INTERNAL' | 'CLIENT',
        body: c.body,
        mentions: c.mentions,
        parentId: c.parentId ?? null,
        reactions: reactionsByComment.get(c.id) || [],
        createdAt: c.createdAt.toISOString(),
        editedAt: c.editedAt ? c.editedAt.toISOString() : null,
        isMine: c.authorType === 'STAFF' && c.authorUserId === userId,
        canManage: isAdmin || (c.authorType === 'STAFF' && c.authorUserId === userId),
    }))
    const eventItems: TaskFeedItem[] = events.map((e) => ({
        kind: 'event',
        id: `evt-${e.id}`,
        authorName: e.actorUserId ? (staffName.get(e.actorUserId) || 'Nhân viên') : 'Khách hàng',
        label: EVENT_LABELS[e.action] || e.action,
        createdAt: e.createdAt.toISOString(),
    }))

    return [...commentItems, ...eventItems].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function createTaskComment(taskId: string, workspaceId: string, input: { body: string; visibility: 'INTERNAL' | 'CLIENT'; parentId?: string | null }) {
    const { userId } = await staffCtx(workspaceId)
    const t = await taskInWorkspace(taskId, workspaceId)
    if (!t) return { success: false, error: 'Không tìm thấy task.' }

    const body = sanitizeClientText(input.body || '', FEEDBACK_MAX_LEN)
    if (!body) return { success: false, error: 'Nội dung trống.' }
    const visibility: 'INTERNAL' | 'CLIENT' = input.visibility === 'INTERNAL' ? 'INTERNAL' : 'CLIENT'
    const mentions = await resolveMentions(body, workspaceId)

    // [P3] Reply: the parent must be a live comment on the SAME task.
    let parentId: string | null = null
    if (input.parentId) {
        const parent = await prisma.taskComment.findFirst({ where: { id: input.parentId, taskId, isDeleted: false }, select: { id: true } })
        if (!parent) return { success: false, error: 'Bình luận gốc không tồn tại.' }
        parentId = parent.id
    }

    const c = await prisma.taskComment.create({
        data: { taskId, authorType: 'STAFF', authorUserId: userId, visibility, body, mentions, parentId },
        select: { id: true, createdAt: true },
    })

    // Notify @mentioned staff (never the author).
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, nickname: true, avatarUrl: true } }).catch(() => null)
    const actorName = actor?.nickname || actor?.username || 'Một thành viên'
    for (const uid of mentions.filter((m) => m !== userId)) {
        try {
            const n = await createNotificationInternal({
                userId: uid, type: 'TASK_COMMENT', title: 'Bạn được nhắc trong một bình luận',
                body: `${actorName}: ${body.slice(0, 140)}`, taskId, actorId: userId, avatarUrl: actor?.avatarUrl,
                metadata: { taskTitle: t.title, preview: body.slice(0, 200) },
            })
            void broadcastNotificationToUser(uid, { id: n.id, type: n.type, title: n.title, body: n.body, taskId, actorId: userId, createdAt: n.createdAt.toISOString(), isRead: false })
        } catch (e) { console.error('[task-comment] mention notify failed', e) }
    }

    void audit({ workspaceId, actorUserId: userId, action: 'task.comment_added', targetType: 'Task', targetId: taskId, after: { visibility, len: body.length } })
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true, id: c.id, createdAt: c.createdAt.toISOString() }
}

export async function editTaskComment(commentId: string, workspaceId: string, body: string) {
    const { userId } = await staffCtx(workspaceId)
    const c = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { authorUserId: true, authorType: true, taskId: true } })
    if (!c) return { success: false, error: 'Không tìm thấy bình luận.' }
    if (!(c.authorType === 'STAFF' && c.authorUserId === userId)) return { success: false, error: 'Chỉ sửa được bình luận của bạn.' }
    if (!(await taskInWorkspace(c.taskId, workspaceId))) return { success: false, error: 'Sai workspace.' }

    const clean = sanitizeClientText(body || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Nội dung trống.' }
    const mentions = await resolveMentions(clean, workspaceId)
    await prisma.taskComment.update({ where: { id: commentId }, data: { body: clean, mentions, editedAt: new Date() } })
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true }
}

export async function deleteTaskComment(commentId: string, workspaceId: string) {
    const { userId, isAdmin } = await staffCtx(workspaceId)
    const c = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { authorUserId: true, authorType: true, taskId: true } })
    if (!c) return { success: false, error: 'Không tìm thấy bình luận.' }
    const own = c.authorType === 'STAFF' && c.authorUserId === userId
    if (!own && !isAdmin) return { success: false, error: 'Không có quyền xoá.' }
    if (!(await taskInWorkspace(c.taskId, workspaceId))) return { success: false, error: 'Sai workspace.' }

    await prisma.taskComment.update({ where: { id: commentId }, data: { isDeleted: true } })
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true }
}

/** [P3] Toggle the caller's emoji reaction on a comment (staff). */
export async function toggleTaskCommentReaction(commentId: string, workspaceId: string, emoji: string) {
    const { userId } = await staffCtx(workspaceId)
    if (!isValidReaction(emoji)) return { success: false, error: 'Emoji không hợp lệ.' }
    const c = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { taskId: true, isDeleted: true } })
    if (!c || c.isDeleted) return { success: false, error: 'Không tìm thấy bình luận.' }
    if (!(await taskInWorkspace(c.taskId, workspaceId))) return { success: false, error: 'Sai workspace.' }

    const existing = await prisma.taskCommentReaction.findFirst({ where: { commentId, emoji, userId }, select: { id: true } })
    if (existing) {
        await prisma.taskCommentReaction.delete({ where: { id: existing.id } })
        return { success: true, reacted: false }
    }
    await prisma.taskCommentReaction.create({ data: { commentId, emoji, userId } })
    return { success: true, reacted: true }
}
