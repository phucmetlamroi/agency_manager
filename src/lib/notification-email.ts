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
    TASK_ASSIGNED:             { bypassMute: true,  bypassDigest: true,  bypassQuietHours: false },
    TASK_UNASSIGNED:           { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    TASK_STATUS_CHANGED:       { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    TASK_DEADLINE_APPROACHING: { bypassMute: true,  bypassDigest: true,  bypassQuietHours: m => m?.tier === '1h' },
    TASK_OVERDUE:              { bypassMute: true,  bypassDigest: true,  bypassQuietHours: true },
    TASK_COMMENT:              { bypassMute: false, bypassDigest: false, bypassQuietHours: false },
    WORKSPACE_INVITATION_ACCEPTED: { bypassMute: false, bypassDigest: true, bypassQuietHours: false },
    WORKSPACE_INVITATION_DECLINED: { bypassMute: false, bypassDigest: true, bypassQuietHours: false },
    WORKSPACE_INVITATION_RECEIVED: { bypassMute: false, bypassDigest: true, bypassQuietHours: false },
}

const DEFAULT_BYPASS = { bypassMute: false, bypassDigest: false, bypassQuietHours: false }

// ── Types ───────────────────────────────────────────────────────────────────

interface NotificationForEmail {
    id: string
    userId: string
    type: NotificationType | string
    title: string
    body: string
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
        case 'taskAssigned': {
            if (!notification.taskId) return null
            const task = await prisma.task.findUnique({
                where: { id: notification.taskId },
                select: {
                    title: true,
                    status: true,
                    deadline: true,
                    project: { select: { name: true } },
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
                select: { title: true, status: true, deadline: true },
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

        // 4. Online check — DISABLED per user request.
        // All notifications must be emailed immediately regardless of online status.
        // Previously: skipped email when user was online for non-bypass-digest types.

        // 5. Atomically claim
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
    const [completedTasksCount, pendingTasksCount, overdueTasksCount] =
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
        ])
    return { completedTasksCount, pendingTasksCount, overdueTasksCount }
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
                    taskId: n.taskId,
                    actorId: n.actorId,
                    metadata: n.metadata as Record<string, any> | null,
                    emailSentAt: n.emailSentAt,
                    createdAt: n.createdAt,
                }))
                const digestItems: DigestNotificationItem[] = enriched.map(n => ({
                    type: String(n.type),
                    title: n.title,
                    body: n.body,
                    metadata: n.metadata,
                    createdAt: n.createdAt,
                }))

                const params: DigestParams = {
                    recipientName,
                    recipientUserId: pref.userId,
                    appUrl: APP_URL,
                    workspaceId: wsId,
                    timeRange,
                    taskNotifications: digestItems,
                    taskCount: digestItems.length,
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
