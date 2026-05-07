/**
 * Email notification decision logic & digest sender.
 *
 * Centralises every "should we email this notification?" decision and dispatches
 * to the per-event template registry in `src/lib/notification-emails/`.
 *
 * Two public entry-points:
 *  1. maybeSendNotificationEmail()  — fire-and-forget after every notification create
 *  2. sendDigestEmails()            — called by the hourly/daily cron job
 */

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { templates, pickTemplate } from '@/lib/notification-emails'
import type {
    DigestNotificationItem,
    DigestParams,
    GroupAddedParams,
    GroupDeletedParams,
    GroupLeftParams,
    GroupRemovedParams,
    MentionParams,
    MessageDMParams,
    MessageGroupParams,
    RenderedEmail,
    TaskAssignedParams,
    TaskCommentParams,
    TaskDeadlineParams,
    TaskOverdueParams,
    TaskStatusChangedParams,
    TaskUnassignedParams,
} from '@/lib/notification-emails/shared/types'
import type { NotificationType } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

/**
 * Per-event bypass rules. Decides whether to skip the user's mute / digest /
 * quiet-hour preference for a given notification type.
 *
 * - bypassMute:        send even if conversation is muted
 * - bypassDigest:      send realtime even if user has HOURLY/DAILY digest mode
 * - bypassQuietHours:  send even during configured quiet hours
 *                      (function form: decide based on metadata, e.g. tier='1h')
 */
const BYPASS_CONFIG: Record<string, {
    bypassMute: boolean
    bypassDigest: boolean
    bypassQuietHours: boolean | ((meta: any) => boolean)
}> = {
    NEW_MESSAGE:               { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    MENTION:                   { bypassMute: true,  bypassDigest: true,  bypassQuietHours: false },
    GROUP_MEMBER_ADDED:        { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    GROUP_MEMBER_REMOVED:      { bypassMute: false, bypassDigest: true,  bypassQuietHours: false },
    GROUP_MEMBER_LEFT:         { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    GROUP_DELETED:             { bypassMute: true,  bypassDigest: true,  bypassQuietHours: false },
    TASK_ASSIGNED:             { bypassMute: true,  bypassDigest: true,  bypassQuietHours: false },
    TASK_UNASSIGNED:           { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    TASK_STATUS_CHANGED:       { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    TASK_DEADLINE_APPROACHING: { bypassMute: true,  bypassDigest: true,  bypassQuietHours: m => m?.tier === '1h' },
    TASK_OVERDUE:              { bypassMute: true,  bypassDigest: true,  bypassQuietHours: true },
    TASK_COMMENT:              { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
}

const DEFAULT_BYPASS = { bypassMute: false, bypassDigest: false, bypassQuietHours: false }

// ── Types ───────────────────────────────────────────────────────────────────

interface NotificationForEmail {
    id: string
    userId: string
    type: NotificationType | string
    title: string
    body: string
    conversationId: string | null
    messageId: string | null
    taskId: string | null
    actorId: string | null
    metadata: Record<string, any> | null
    emailSentAt: Date | null
    createdAt: Date
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function isUserOffline(userId: string): Promise<boolean> {
    const presence = await prisma.userPresence.findUnique({ where: { userId } })
    if (!presence) return true
    if (presence.status === 'OFFLINE') return true
    return presence.lastHeartbeat < new Date(Date.now() - OFFLINE_THRESHOLD_MS)
}

function isInQuietHours(start: number | null, end: number | null): boolean {
    if (start == null || end == null) return false
    const nowHour = new Date().getUTCHours()
    if (start <= end) return nowHour >= start && nowHour < end
    return nowHour >= start || nowHour < end
}

async function isConversationMutedForUser(
    userId: string,
    conversationId: string | null,
): Promise<boolean> {
    if (!conversationId) return false
    const participant = await prisma.conversationParticipant.findFirst({
        where: { conversationId, userId },
        select: { isMuted: true },
    })
    return participant?.isMuted === true
}

function resolveBypass(
    rule: boolean | ((meta: any) => boolean),
    metadata: any,
): boolean {
    return typeof rule === 'function' ? rule(metadata) : rule
}

async function claimForEmail(notificationId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
        where: { id: notificationId, emailSentAt: null },
        data: { emailSentAt: new Date() },
    })
    return result.count > 0
}

// ── Enrichment: build template params from a Notification + DB lookups ──────

interface EnrichmentContext {
    notification: NotificationForEmail
    recipientName: string
    recipientUserId: string
    appUrl: string
    workspaceId: string | null
}

async function buildTemplateParams(ctx: EnrichmentContext): Promise<RenderedEmail | null> {
    const { notification, recipientName, recipientUserId, appUrl, workspaceId } = ctx
    const meta = notification.metadata || {}
    const templateName = pickTemplate(notification.type, meta)
    if (!templateName) return null

    const baseParams = {
        recipientName,
        recipientUserId,
        appUrl,
        workspaceId,
    }

    // Helper: load actor's display name + avatar
    const actor = notification.actorId
        ? await prisma.user.findUnique({
            where: { id: notification.actorId },
            select: { username: true, nickname: true, avatarUrl: true },
        }).catch(() => null)
        : null
    const actorName = actor?.nickname || actor?.username || (meta.actorName as string) || (meta.senderName as string) || 'Một thành viên'
    const actorAvatar = actor?.avatarUrl ?? null

    switch (templateName) {
        case 'messageDM': {
            if (!notification.conversationId) return null
            const params: MessageDMParams = {
                ...baseParams,
                senderName: actorName,
                senderAvatarUrl: actorAvatar,
                messagePreview: meta.preview || notification.body || '',
                messageTime: notification.createdAt,
                conversationId: notification.conversationId,
                msgType: meta.msgType ?? null,
            }
            return await templates.messageDM(params)
        }
        case 'messageGroup': {
            if (!notification.conversationId) return null
            const params: MessageGroupParams = {
                ...baseParams,
                senderName: actorName,
                senderAvatarUrl: actorAvatar,
                messagePreview: meta.preview || notification.body || '',
                messageTime: notification.createdAt,
                conversationId: notification.conversationId,
                msgType: meta.msgType ?? null,
                groupName: meta.convLabel || meta.groupName || 'Group',
                groupAvatarUrl: meta.groupAvatarUrl ?? null,
            }
            return await templates.messageGroup(params)
        }
        case 'mention': {
            if (!notification.conversationId) return null
            const params: MentionParams = {
                ...baseParams,
                senderName: actorName,
                senderAvatarUrl: actorAvatar,
                conversationName: meta.convLabel || meta.groupName || actorName,
                conversationType: meta.convType === 'GROUP' ? 'GROUP' : 'DIRECT',
                messagePreview: meta.preview || notification.body || '',
                messageTime: notification.createdAt,
                conversationId: notification.conversationId,
            }
            return await templates.mention(params)
        }
        case 'groupMemberAdded': {
            if (!notification.conversationId) return null
            // Fetch participants for member preview
            const participants = await prisma.conversationParticipant.findMany({
                where: { conversationId: notification.conversationId },
                include: { user: { select: { username: true, nickname: true } } },
                orderBy: { joinedAt: 'asc' },
                take: 8,
            }).catch(() => [])
            const memberNames = participants
                .map(p => p.user?.nickname || p.user?.username || '')
                .filter(Boolean)
            const conv = await prisma.conversation.findUnique({
                where: { id: notification.conversationId },
                select: { name: true, avatarUrl: true, createdAt: true, participants: { select: { id: true } } },
            }).catch(() => null)
            const params: GroupAddedParams = {
                ...baseParams,
                groupName: conv?.name || meta.groupName || 'Group',
                groupAvatarUrl: conv?.avatarUrl ?? null,
                adderName: actorName,
                memberCount: conv?.participants.length ?? memberNames.length,
                memberNames,
                createdAt: conv?.createdAt ?? notification.createdAt,
                conversationId: notification.conversationId,
            }
            return await templates.groupMemberAdded(params)
        }
        case 'groupMemberRemoved': {
            const params: GroupRemovedParams = {
                ...baseParams,
                groupName: meta.groupName || 'Group',
                removerName: actorName,
            }
            return await templates.groupMemberRemoved(params)
        }
        case 'groupMemberLeft': {
            if (!notification.conversationId) return null
            const conv = await prisma.conversation.findUnique({
                where: { id: notification.conversationId },
                select: { name: true, participants: { select: { id: true } } },
            }).catch(() => null)
            const leaverName = (meta.leaverName as string) || actorName
            const params: GroupLeftParams = {
                ...baseParams,
                groupName: conv?.name || meta.groupName || 'Group',
                leaverName,
                leaverAvatarUrl: actorAvatar,
                leftAt: notification.createdAt,
                remainingMemberCount: conv?.participants.length ?? 0,
                conversationId: notification.conversationId,
            }
            return await templates.groupMemberLeft(params)
        }
        case 'groupDeleted': {
            const params: GroupDeletedParams = {
                ...baseParams,
                groupName: meta.groupName || 'Group',
                creatorName: actorName,
            }
            return await templates.groupDeleted(params)
        }
        case 'taskAssigned': {
            if (!notification.taskId) return null
            const task = await prisma.task.findUnique({
                where: { id: notification.taskId },
                select: {
                    title: true,
                    status: true,
                    deadline: true,
                    project: { select: { name: true } },
                    conversation: { select: { id: true } },
                },
            }).catch(() => null)
            const params: TaskAssignedParams = {
                ...baseParams,
                taskTitle: task?.title || meta.taskTitle || 'Task',
                assignerName: actorName,
                projectName: task?.project?.name ?? null,
                status: task?.status || 'Đang thực hiện',
                priority: (meta.priority as string) || null,
                deadline: task?.deadline ?? null,
                description: (meta.description as string) || null,
                taskId: notification.taskId,
                conversationId: task?.conversation?.id ?? null,
            }
            return await templates.taskAssigned(params)
        }
        case 'taskUnassigned': {
            const params: TaskUnassignedParams = {
                ...baseParams,
                taskTitle: meta.taskTitle || 'Task',
                unassignerName: actorName,
            }
            return await templates.taskUnassigned(params)
        }
        case 'taskStatusChanged': {
            if (!notification.taskId) return null
            const task = await prisma.task.findUnique({
                where: { id: notification.taskId },
                select: { title: true, deadline: true },
            }).catch(() => null)
            const params: TaskStatusChangedParams = {
                ...baseParams,
                taskTitle: task?.title || meta.taskTitle || 'Task',
                actorName,
                actorAvatarUrl: actorAvatar,
                oldStatus: meta.oldStatus || '',
                newStatus: meta.newStatus || '',
                deadline: task?.deadline ?? null,
                changedAt: notification.createdAt,
                taskId: notification.taskId,
            }
            return await templates.taskStatusChanged(params)
        }
        case 'taskDeadline24h':
        case 'taskDeadline1h': {
            if (!notification.taskId) return null
            const task = await prisma.task.findUnique({
                where: { id: notification.taskId },
                select: { title: true, status: true, deadline: true, conversation: { select: { id: true } } },
            }).catch(() => null)
            const deadline = task?.deadline ?? (meta.deadline ? new Date(meta.deadline) : null)
            if (!deadline) return null
            const params: TaskDeadlineParams = {
                ...baseParams,
                taskTitle: task?.title || meta.taskTitle || 'Task',
                status: task?.status || 'Đang thực hiện',
                deadline,
                assignerName: meta.assignerName ?? null,
                taskId: notification.taskId,
                conversationId: task?.conversation?.id ?? null,
            }
            return templateName === 'taskDeadline1h'
                ? await templates.taskDeadline1h(params)
                : await templates.taskDeadline24h(params)
        }
        case 'taskOverdue': {
            if (!notification.taskId) return null
            const task = await prisma.task.findUnique({
                where: { id: notification.taskId },
                select: { title: true, status: true, deadline: true, assignee: { select: { username: true, nickname: true } } },
            }).catch(() => null)
            const deadline = task?.deadline ?? (meta.deadline ? new Date(meta.deadline) : null)
            if (!deadline) return null
            const { formatOverdueDuration } = await import('@/lib/notification-emails/shared/format')
            const assigneeName = task?.assignee?.nickname || task?.assignee?.username || recipientName
            const params: TaskOverdueParams = {
                ...baseParams,
                taskTitle: task?.title || meta.taskTitle || 'Task',
                status: task?.status || 'Quá hạn',
                deadline,
                assigneeName,
                overdueDuration: formatOverdueDuration(deadline),
                taskId: notification.taskId,
                isManagerView: !!meta.isManagerView,
            }
            return await templates.taskOverdue(params)
        }
        case 'taskComment': {
            if (!notification.taskId) return null
            const params: TaskCommentParams = {
                ...baseParams,
                taskTitle: meta.taskTitle || 'Task',
                commenterName: actorName,
                commenterAvatarUrl: actorAvatar,
                commentPreview: meta.preview || notification.body || '',
                commentTime: notification.createdAt,
                taskId: notification.taskId,
            }
            return await templates.taskComment(params)
        }
        default:
            return null
    }
}

/**
 * Best-effort workspace resolver — pick the first workspace the user has access to.
 * Used to build CTA links like /{workspaceId}/dashboard?taskId=...
 */
async function resolveWorkspaceId(userId: string, hint: string | null): Promise<string | null> {
    if (hint) return hint
    const member = await prisma.workspaceMember.findFirst({
        where: { userId },
        select: { workspaceId: true },
        orderBy: { joinedAt: 'asc' },
    }).catch(() => null)
    return member?.workspaceId ?? null
}

/**
 * Find a workspaceId associated with the notification (via task or conversation).
 */
async function workspaceIdForNotification(n: NotificationForEmail): Promise<string | null> {
    if (n.taskId) {
        const t = await prisma.task.findUnique({
            where: { id: n.taskId },
            select: { workspaceId: true },
        }).catch(() => null)
        if (t?.workspaceId) return t.workspaceId
    }
    if (n.conversationId) {
        const c = await prisma.conversation.findUnique({
            where: { id: n.conversationId },
            select: { workspaceId: true },
        }).catch(() => null)
        if (c?.workspaceId) return c.workspaceId
    }
    return null
}

// ── Public: Realtime email ──────────────────────────────────────────────────

export async function maybeSendNotificationEmail(
    notification: NotificationForEmail,
    recipientEmail: string | null,
): Promise<void> {
    const tag = `[notification-email] [${notification.type}] [user:${notification.userId}]`
    try {
        if (notification.emailSentAt) {
            console.log(`${tag} SKIP: emailSentAt already set`)
            return
        }
        if (!recipientEmail) {
            console.log(`${tag} SKIP: no recipient email`)
            return
        }

        console.log(`${tag} Processing email to ${recipientEmail}...`)

        const cfg = BYPASS_CONFIG[notification.type] || DEFAULT_BYPASS

        // 1. Load preferences (lazy create defaults)
        const pref = await prisma.notificationPreference.findUnique({
            where: { userId: notification.userId },
        })
        const emailEnabled = pref?.emailEnabled ?? true
        const digestMode = pref?.emailDigestMode ?? 'REALTIME'

        if (!emailEnabled || digestMode === 'OFF') {
            console.log(`${tag} SKIP: emailEnabled=${emailEnabled}, digestMode=${digestMode}`)
            return
        }

        // 2. Digest mode → defer to cron unless this event bypasses digest
        if ((digestMode === 'HOURLY' || digestMode === 'DAILY') && !cfg.bypassDigest) {
            console.log(`${tag} SKIP: digest mode ${digestMode}, bypassDigest=${cfg.bypassDigest}`)
            return
        }

        // 3. Quiet hours
        const inQuiet = isInQuietHours(pref?.quietHoursStart ?? null, pref?.quietHoursEnd ?? null)
        if (inQuiet && !resolveBypass(cfg.bypassQuietHours, notification.metadata)) {
            console.log(`${tag} SKIP: quiet hours active, bypassQuietHours=${cfg.bypassQuietHours}`)
            return
        }

        // 4. Online check (only for non-bypass-digest types — bypass-digest events
        //    are urgent enough to email even when user is online)
        if (!cfg.bypassDigest) {
            const offline = await isUserOffline(notification.userId)
            if (!offline) {
                console.log(`${tag} SKIP: user is online, bypassDigest=${cfg.bypassDigest}`)
                return
            }
        }

        // 5. Conversation mute
        if (notification.conversationId && !cfg.bypassMute) {
            const muted = await isConversationMutedForUser(notification.userId, notification.conversationId)
            if (muted) {
                console.log(`${tag} SKIP: conversation muted`)
                return
            }
        }

        // 6. Atomically claim
        const claimed = await claimForEmail(notification.id)
        if (!claimed) {
            console.log(`${tag} SKIP: claim failed (already claimed)`)
            return
        }

        // 7. Resolve recipient + workspace
        const user = await prisma.user.findUnique({
            where: { id: notification.userId },
            select: { username: true, nickname: true },
        })
        const recipientName = user?.nickname || user?.username || 'Bạn'
        const wsId = await resolveWorkspaceId(notification.userId, await workspaceIdForNotification(notification))

        console.log(`${tag} Rendering template for ${recipientName}, workspace=${wsId}`)

        // 8. Render via registry
        const rendered = await buildTemplateParams({
            notification,
            recipientName,
            recipientUserId: notification.userId,
            appUrl: APP_URL,
            workspaceId: wsId,
        })

        if (!rendered) {
            console.log(`${tag} SKIP: no template rendered for type ${notification.type}`)
            return
        }

        console.log(`${tag} Sending email to ${recipientEmail}, subject="${rendered.subject}"`)
        await sendEmail({
            to: recipientEmail,
            subject: rendered.subject,
            html: rendered.html,
        })
        console.log(`${tag} ✅ Email pipeline complete`)
    } catch (err) {
        console.error(`${tag} ERROR:`, err)
    }
}

// ── Public: Digest email ────────────────────────────────────────────────────

function bucketByCategory(notifs: NotificationForEmail[]): {
    chat: DigestNotificationItem[]
    task: DigestNotificationItem[]
    group: DigestNotificationItem[]
} {
    const chat: DigestNotificationItem[] = []
    const task: DigestNotificationItem[] = []
    const group: DigestNotificationItem[] = []

    for (const n of notifs) {
        const item: DigestNotificationItem = {
            type: String(n.type),
            title: n.title,
            body: n.body,
            metadata: n.metadata,
            createdAt: n.createdAt,
        }
        if (n.type === 'NEW_MESSAGE' || n.type === 'MENTION' || n.type === 'TASK_COMMENT') chat.push(item)
        else if (String(n.type).startsWith('TASK_')) task.push(item)
        else if (String(n.type).startsWith('GROUP_')) group.push(item)
        else chat.push(item) // fallback
    }

    return { chat, task, group }
}

function formatTimeRangeHourly(now: Date): string {
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)
    const fmt = (d: Date) =>
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(d).replace(',', '')
    const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now)
    const [y, m, d] = date.split('-')
    return `${fmt(lastHour)} - ${fmt(now)} · ${d}/${m}/${y}`
}

function formatTimeRangeDaily(now: Date): string {
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(yesterday)
    const [y, m, d] = date.split('-')
    return `${d}/${m}/${y}`
}

async function loadDailyOverview(userId: string): Promise<DigestParams['overview']> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const [completedTasksCount, pendingTasksCount, overdueTasksCount, unreadMessagesCount] =
        await Promise.all([
            prisma.task.count({
                where: { assigneeId: userId, status: 'Hoàn tất', updatedAt: { gte: oneDayAgo } },
            }).catch(() => 0),
            prisma.task.count({
                where: { assigneeId: userId, status: { notIn: ['Hoàn tất', 'Đã hủy', 'Quá hạn'] } },
            }).catch(() => 0),
            prisma.task.count({
                where: { assigneeId: userId, status: 'Quá hạn' },
            }).catch(() => 0),
            prisma.notification.count({
                where: { userId, isRead: false, isArchived: false, type: { in: ['NEW_MESSAGE', 'MENTION'] } },
            }).catch(() => 0),
        ])
    return { completedTasksCount, pendingTasksCount, overdueTasksCount, unreadMessagesCount }
}

export async function sendDigestEmails(
    mode: 'HOURLY' | 'DAILY',
): Promise<{ sent: number; skipped: number }> {
    let sent = 0
    let skipped = 0
    const now = new Date()
    const timeRange = mode === 'HOURLY' ? formatTimeRangeHourly(now) : formatTimeRangeDaily(now)

    try {
        const prefs = await prisma.notificationPreference.findMany({
            where: { emailDigestMode: mode, emailEnabled: true },
            select: { userId: true, quietHoursStart: true, quietHoursEnd: true },
        })

        for (const pref of prefs) {
            try {
                if (mode === 'HOURLY' && isInQuietHours(pref.quietHoursStart, pref.quietHoursEnd)) {
                    skipped++
                    continue
                }

                const notifications = await prisma.notification.findMany({
                    where: {
                        userId: pref.userId,
                        emailSentAt: null,
                        isArchived: false,
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 50,
                })

                if (notifications.length === 0) {
                    skipped++
                    continue
                }

                const user = await prisma.user.findUnique({
                    where: { id: pref.userId },
                    select: { email: true, username: true, nickname: true },
                })
                if (!user?.email) {
                    skipped++
                    continue
                }
                const recipientName = user.nickname || user.username || 'Bạn'
                const wsId = await resolveWorkspaceId(pref.userId, null)

                const enriched: NotificationForEmail[] = notifications.map(n => ({
                    id: n.id,
                    userId: n.userId,
                    type: n.type,
                    title: n.title,
                    body: n.body,
                    conversationId: n.conversationId,
                    messageId: n.messageId,
                    taskId: n.taskId,
                    actorId: n.actorId,
                    metadata: n.metadata as Record<string, any> | null,
                    emailSentAt: n.emailSentAt,
                    createdAt: n.createdAt,
                }))
                const buckets = bucketByCategory(enriched)

                const params: DigestParams = {
                    recipientName,
                    recipientUserId: pref.userId,
                    appUrl: APP_URL,
                    workspaceId: wsId,
                    timeRange,
                    chatNotifications: buckets.chat,
                    taskNotifications: buckets.task,
                    groupNotifications: buckets.group,
                    chatCount: buckets.chat.length,
                    taskCount: buckets.task.length,
                    groupCount: buckets.group.length,
                    totalCount: enriched.length,
                    overview: mode === 'DAILY' ? await loadDailyOverview(pref.userId) : undefined,
                }

                const rendered = mode === 'DAILY'
                    ? await templates.digestDaily(params)
                    : await templates.digestHourly(params)

                await sendEmail({
                    to: user.email,
                    subject: rendered.subject,
                    html: rendered.html,
                })

                await prisma.notification.updateMany({
                    where: { id: { in: notifications.map(n => n.id) } },
                    data: { emailSentAt: new Date() },
                })

                sent++
            } catch (userErr) {
                console.error(`[notification-email] Digest error for user ${pref.userId}:`, userErr)
                skipped++
            }
        }
    } catch (err) {
        console.error('[notification-email] sendDigestEmails error:', err)
    }

    return { sent, skipped }
}
