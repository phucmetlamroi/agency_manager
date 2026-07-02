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
import { broadcastNotificationToUser, broadcastToTopic } from '@/lib/notification-broadcast'
import { getTaskCommentChannel, TASK_COMMENT_EVENTS } from '@/lib/notification-channels'
import { isValidReaction } from '@/lib/comment-reactions'
import { revalidatePath } from 'next/cache'

// [Chat GĐ3 · E1] Nudge every open drawer viewing this task to refetch. The
// payload carries only ids — the client re-fetches the role-filtered feed, so
// no INTERNAL content is ever pushed over the wire.
function broadcastFeedChanged(taskId: string, commentId?: string) {
    void broadcastToTopic(getTaskCommentChannel(taskId), TASK_COMMENT_EVENTS.FEED_CHANGED, {
        taskId,
        commentId: commentId ?? null,
    })
}

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

    // [Chat GĐ3 · C2] Message-as-action-item. When actionAssignedToId is set the
    // comment carries an assignment badge; actionResolvedAt !== null = done.
    actionAssignedToId?: string | null
    actionAssignedToName?: string | null
    actionAssignedById?: string | null
    actionAssignedByName?: string | null
    actionAssignedAt?: string | null
    actionResolvedAt?: string | null
    actionResolvedById?: string | null
    actionResolvedByName?: string | null
    /** [C4] A task was spawned from this message (backlink id). */
    spawnedTaskId?: string | null
    /** [F2] Pinned-at timestamp (null = not pinned). */
    pinnedAt?: string | null
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

export type MentionRelation = 'editor' | 'manager' | 'client' | 'member'
export interface MentionTarget { id: string; username: string; nickname: string | null; avatarUrl: string | null; relation: MentionRelation }

const MENTION_RANK: Record<MentionRelation, number> = { editor: 0, manager: 1, client: 2, member: 3 }
const MENTION_USER_SELECT = { id: true, username: true, nickname: true, avatarUrl: true } as const

/**
 * The people relevant to a task, for @mention: the task's EDITOR (assignee) and
 * MANAGER (assignedById) first, then any client-linked account, then every staff
 * member of the task's PROFILE (OWNER/ADMIN/USER). Deduped by userId, first
 * relation wins (so editor/manager keep their label). Powers both the composer
 * dropdown and server-side mention→notify resolution — one source of truth.
 */
async function buildTaskMentionUsers(taskId: string): Promise<MentionTarget[]> {
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { assigneeId: true, assignedById: true, clientId: true, profileId: true },
    })
    if (!task) return []

    const byId = new Map<string, MentionTarget>()
    const add = (u: { id: string; username: string; nickname: string | null; avatarUrl: string | null } | null, relation: MentionRelation) => {
        if (u && !byId.has(u.id)) byId.set(u.id, { id: u.id, username: u.username, nickname: u.nickname, avatarUrl: u.avatarUrl, relation })
    }

    // Editor (assignee) + Manager (assignedById) — the two most-relevant.
    if (task.assigneeId) add(await prisma.user.findUnique({ where: { id: task.assigneeId }, select: MENTION_USER_SELECT }), 'editor')
    if (task.assignedById) add(await prisma.user.findUnique({ where: { id: task.assignedById }, select: MENTION_USER_SELECT }), 'manager')

    // The client's account(s), if any (token-only clients usually have none — a
    // mention still can't push to a login-less client, but if a real account is
    // linked we surface it). Never LOCKED.
    if (task.clientId != null) {
        const clientUsers = await prisma.user.findMany({ where: { clientId: task.clientId, role: { not: 'LOCKED' } }, select: MENTION_USER_SELECT })
        for (const u of clientUsers) add(u, 'client')
    }

    // Every staff member of the task's PROFILE (not just this workspace).
    if (task.profileId) {
        const staff = await prisma.profileAccess.findMany({
            where: { profileId: task.profileId, role: { in: ['OWNER', 'ADMIN', 'USER'] } },
            select: { user: { select: MENTION_USER_SELECT } },
        })
        for (const s of staff) add(s.user, 'member')
    }

    return Array.from(byId.values())
}

/** Parse @username tokens → userIds relevant to THIS task (unknown/irrelevant handles ignored). */
async function resolveMentions(body: string, taskId: string): Promise<string[]> {
    const handles = Array.from(new Set((body.match(/@([a-zA-Z0-9_.\-]+)/g) || []).map((h) => h.slice(1).toLowerCase())))
    if (!handles.length) return []
    const users = await buildTaskMentionUsers(taskId)
    const byName = new Map(users.map((u) => [u.username.toLowerCase(), u.id]))
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
        ...comments.map((c) => c.actionAssignedToId).filter((x): x is string => !!x),
        ...comments.map((c) => c.actionAssignedById).filter((x): x is string => !!x),
        ...comments.map((c) => c.actionResolvedById).filter((x): x is string => !!x),
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
        actionAssignedToId: c.actionAssignedToId ?? null,
        actionAssignedToName: c.actionAssignedToId ? staffName.get(c.actionAssignedToId) || 'Nhân viên' : null,
        actionAssignedById: c.actionAssignedById ?? null,
        actionAssignedByName: c.actionAssignedById ? staffName.get(c.actionAssignedById) || 'Nhân viên' : null,
        actionAssignedAt: c.actionAssignedAt ? c.actionAssignedAt.toISOString() : null,
        actionResolvedAt: c.actionResolvedAt ? c.actionResolvedAt.toISOString() : null,
        actionResolvedById: c.actionResolvedById ?? null,
        actionResolvedByName: c.actionResolvedById ? staffName.get(c.actionResolvedById) || 'Nhân viên' : null,
        spawnedTaskId: c.spawnedTaskId ?? null,
        pinnedAt: c.pinnedAt ? c.pinnedAt.toISOString() : null,
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
    const mentions = await resolveMentions(body, taskId)

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
    broadcastFeedChanged(taskId, c.id)
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
    const mentions = await resolveMentions(clean, c.taskId)
    await prisma.taskComment.update({ where: { id: commentId }, data: { body: clean, mentions, editedAt: new Date() } })
    broadcastFeedChanged(c.taskId, commentId)
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
    broadcastFeedChanged(c.taskId, commentId)
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
        broadcastFeedChanged(c.taskId, commentId)
        return { success: true, reacted: false }
    }
    await prisma.taskCommentReaction.create({ data: { commentId, emoji, userId } })
    broadcastFeedChanged(c.taskId, commentId)
    return { success: true, reacted: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// [Chat GĐ3 · C2] Message-as-action-item — assign → resolve → reopen
// ─────────────────────────────────────────────────────────────────────────────

/** Is `candidateUserId` a member of this workspace? (guards cross-tenant assign) */
async function isWorkspaceMember(workspaceId: string, candidateUserId: string): Promise<boolean> {
    const m = await prisma.workspaceMember.findFirst({
        where: { workspaceId, userId: candidateUserId },
        select: { id: true },
    })
    return !!m
}

/**
 * Assign a comment to a staff member (turns it into an action item), or clear
 * the assignment when `assigneeUserId` is null. A fresh assignment also clears
 * any prior resolution (re-opens it). Notifies the assignee (never self).
 */
export async function assignTaskComment(commentId: string, workspaceId: string, assigneeUserId: string | null) {
    const { userId } = await staffCtx(workspaceId)
    const c = await prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { taskId: true, isDeleted: true, body: true },
    })
    if (!c || c.isDeleted) return { success: false, error: 'Không tìm thấy bình luận.' }
    const t = await taskInWorkspace(c.taskId, workspaceId)
    if (!t) return { success: false, error: 'Sai workspace.' }

    // Clear assignment.
    if (!assigneeUserId) {
        await prisma.taskComment.update({
            where: { id: commentId },
            data: {
                actionAssignedToId: null, actionAssignedById: null, actionAssignedAt: null,
                actionResolvedAt: null, actionResolvedById: null,
            },
        })
        void audit({ workspaceId, actorUserId: userId, action: 'task.comment_unassigned', targetType: 'Task', targetId: c.taskId })
        broadcastFeedChanged(c.taskId, commentId)
        try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
        return { success: true }
    }

    if (!(await isWorkspaceMember(workspaceId, assigneeUserId))) {
        return { success: false, error: 'Người được giao không thuộc workspace.' }
    }

    await prisma.taskComment.update({
        where: { id: commentId },
        data: {
            actionAssignedToId: assigneeUserId, actionAssignedById: userId, actionAssignedAt: new Date(),
            actionResolvedAt: null, actionResolvedById: null,
        },
    })

    // Notify the assignee (never notify yourself).
    if (assigneeUserId !== userId) {
        try {
            const actor = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, nickname: true, avatarUrl: true } }).catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Một thành viên'
            const n = await createNotificationInternal({
                userId: assigneeUserId, type: 'COMMENT_ASSIGNED', title: 'Bạn được giao một việc từ bình luận',
                body: `${actorName}: ${c.body.slice(0, 140)}`, taskId: c.taskId, actorId: userId, avatarUrl: actor?.avatarUrl || undefined,
                metadata: { taskTitle: t.title, commentId, preview: c.body.slice(0, 200) },
            })
            void broadcastNotificationToUser(assigneeUserId, { id: n.id, type: n.type, title: n.title, body: n.body, taskId: c.taskId, actorId: userId, createdAt: n.createdAt.toISOString(), isRead: false })
        } catch (e) { console.error('[task-comment] assign notify failed', e) }
    }

    void audit({ workspaceId, actorUserId: userId, action: 'task.comment_assigned', targetType: 'Task', targetId: c.taskId, after: { commentId, assigneeUserId } })
    broadcastFeedChanged(c.taskId, commentId)
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true }
}

/** Mark an action item resolved. Notifies the assigner (never self). */
export async function resolveTaskComment(commentId: string, workspaceId: string) {
    const { userId } = await staffCtx(workspaceId)
    const c = await prisma.taskComment.findUnique({
        where: { id: commentId },
        select: { taskId: true, isDeleted: true, body: true, actionAssignedById: true, actionAssignedToId: true },
    })
    if (!c || c.isDeleted) return { success: false, error: 'Không tìm thấy bình luận.' }
    const t = await taskInWorkspace(c.taskId, workspaceId)
    if (!t) return { success: false, error: 'Sai workspace.' }

    await prisma.taskComment.update({
        where: { id: commentId },
        data: { actionResolvedAt: new Date(), actionResolvedById: userId },
    })

    // Notify whoever assigned it (if that isn't the resolver).
    const notifyId = c.actionAssignedById
    if (notifyId && notifyId !== userId) {
        try {
            const actor = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, nickname: true, avatarUrl: true } }).catch(() => null)
            const actorName = actor?.nickname || actor?.username || 'Một thành viên'
            const n = await createNotificationInternal({
                userId: notifyId, type: 'COMMENT_RESOLVED', title: 'Việc bạn giao đã được xử lý',
                body: `${actorName} đã xử lý: ${c.body.slice(0, 120)}`, taskId: c.taskId, actorId: userId, avatarUrl: actor?.avatarUrl || undefined,
                metadata: { taskTitle: t.title, commentId, preview: c.body.slice(0, 200) },
            })
            void broadcastNotificationToUser(notifyId, { id: n.id, type: n.type, title: n.title, body: n.body, taskId: c.taskId, actorId: userId, createdAt: n.createdAt.toISOString(), isRead: false })
        } catch (e) { console.error('[task-comment] resolve notify failed', e) }
    }

    void audit({ workspaceId, actorUserId: userId, action: 'task.comment_resolved', targetType: 'Task', targetId: c.taskId, after: { commentId } })
    broadcastFeedChanged(c.taskId, commentId)
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true }
}

/** Re-open a resolved action item (clears the resolution, keeps the assignment). */
export async function reopenTaskComment(commentId: string, workspaceId: string) {
    const { userId } = await staffCtx(workspaceId)
    const c = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { taskId: true, isDeleted: true } })
    if (!c || c.isDeleted) return { success: false, error: 'Không tìm thấy bình luận.' }
    if (!(await taskInWorkspace(c.taskId, workspaceId))) return { success: false, error: 'Sai workspace.' }

    await prisma.taskComment.update({ where: { id: commentId }, data: { actionResolvedAt: null, actionResolvedById: null } })
    void audit({ workspaceId, actorUserId: userId, action: 'task.comment_reopened', targetType: 'Task', targetId: c.taskId, after: { commentId } })
    broadcastFeedChanged(c.taskId, commentId)
    try { revalidatePath(`/${workspaceId}/admin`) } catch { /* best-effort */ }
    return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// [Chat GĐ3 · D1] Per-task unread — read marker + badge counts
// ─────────────────────────────────────────────────────────────────────────────

/** Mark the task's comments read up to now for the signed-in staff user. */
export async function markTaskCommentsRead(taskId: string, workspaceId: string) {
    const { userId } = await staffCtx(workspaceId)
    if (!(await taskInWorkspace(taskId, workspaceId))) return { success: false, error: 'Sai workspace.' }
    await prisma.taskCommentReadState.upsert({
        where: { userId_taskId: { userId, taskId } },
        update: { lastReadAt: new Date() },
        create: { userId, taskId },
    })
    return { success: true }
}

export interface TaskUnread { total: number; unread: number }

/**
 * For the task table: per-task total comment count (💬) + unread count (others'
 * comments after my lastReadAt). Staff see every comment, so no visibility
 * filter. Small-team scale → compute in JS from minimal columns.
 */
export async function getTaskUnreadCounts(workspaceId: string, taskIds: string[]): Promise<Record<string, TaskUnread>> {
    const { userId } = await staffCtx(workspaceId)
    const out: Record<string, TaskUnread> = {}
    const ids = Array.from(new Set(taskIds)).filter(Boolean)
    if (!ids.length) return out

    // Only tasks that really belong to this workspace (guards id spoofing).
    const validTasks = await prisma.task.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true } })
    const validIds = validTasks.map((t) => t.id)
    if (!validIds.length) return out

    const [comments, reads] = await Promise.all([
        prisma.taskComment.findMany({
            where: { taskId: { in: validIds }, isDeleted: false },
            select: { taskId: true, createdAt: true, authorUserId: true },
        }),
        prisma.taskCommentReadState.findMany({
            where: { userId, taskId: { in: validIds } },
            select: { taskId: true, lastReadAt: true },
        }),
    ])
    const lastRead = new Map(reads.map((r) => [r.taskId, r.lastReadAt]))
    for (const id of validIds) out[id] = { total: 0, unread: 0 }
    for (const c of comments) {
        const agg = out[c.taskId]
        if (!agg) continue
        agg.total++
        const seenAt = lastRead.get(c.taskId)
        const isOthers = c.authorUserId !== userId // don't count my own as unread
        if (isOthers && (!seenAt || c.createdAt > seenAt)) agg.unread++
    }
    return out
}

// ─────────────────────────────────────────────────────────────────────────────
// [Chat GĐ3 · B3] @mention autocomplete — workspace member search
// ─────────────────────────────────────────────────────────────────────────────

export interface MemberSuggestion { id: string; username: string; nickname: string | null; avatarUrl: string | null }

/** Search workspace members by username/nickname for the @mention dropdown. */
export async function searchWorkspaceMembers(workspaceId: string, q: string): Promise<MemberSuggestion[]> {
    await staffCtx(workspaceId)
    const query = (q || '').trim().toLowerCase()
    const members = await prisma.workspaceMember.findMany({
        where: { workspaceId },
        select: { user: { select: { id: true, username: true, nickname: true, avatarUrl: true } } },
        take: 100,
    })
    const all = members.map((m) => m.user)
    const filtered = query
        ? all.filter((u) => u.username.toLowerCase().includes(query) || (u.nickname || '').toLowerCase().includes(query))
        : all
    return filtered.slice(0, 8).map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, avatarUrl: u.avatarUrl }))
}

/**
 * [Chat GĐ3 · B3, task-scoped] @mention suggestions relevant to THIS task only —
 * editor + manager first, then any client account, then the task's PROFILE staff.
 * Replaces the workspace-wide list so the dropdown never offers unrelated people.
 */
export async function getTaskMentionTargets(taskId: string, workspaceId: string, q: string): Promise<MentionTarget[]> {
    await staffCtx(workspaceId)
    if (!(await taskInWorkspace(taskId, workspaceId))) return []
    const query = (q || '').trim().toLowerCase()
    const users = await buildTaskMentionUsers(taskId)
    const filtered = query
        ? users.filter((u) => u.username.toLowerCase().includes(query) || (u.nickname || '').toLowerCase().includes(query))
        : users
    return filtered
        .sort((a, b) => MENTION_RANK[a.relation] - MENTION_RANK[b.relation] || (a.nickname || a.username).localeCompare(b.nickname || b.username))
        .slice(0, 10)
}
