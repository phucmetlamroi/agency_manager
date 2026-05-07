/**
 * Email notification decision logic & digest sender.
 *
 * This module centralises every decision about "should we email this notification?"
 * so that individual action files never need to think about it.
 *
 * Two public entry-points:
 *  1. maybeSendNotificationEmail()  — called fire-and-forget after every notification create
 *  2. sendDigestEmails()            — called by the hourly/daily cron job
 */

import { prisma } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { emailTemplates } from '@/lib/email-templates'
import type { NotificationType } from '@prisma/client'

// ── Constants ───────────────────────────────────────────────────────────────

/** How long since last heartbeat before we consider the user "offline" */
const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

/**
 * These notification types already have their own rich email templates
 * sent directly from task-actions / task-management-actions.
 * We skip them here to avoid double-emailing.
 */
const TYPES_WITH_DEDICATED_EMAIL = new Set<string>([
    'TASK_ASSIGNED',
    'TASK_UNASSIGNED',
    'TASK_STATUS_CHANGED',
    'TASK_COMMENT',
])

/** Types that override conversation mute (same rules as in-app) */
const MUTE_OVERRIDE_TYPES = new Set<string>(['MENTION'])

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

// ── Types ───────────────────────────────────────────────────────────────────

interface NotificationForEmail {
    id: string
    userId: string
    type: NotificationType | string
    title: string
    body: string
    conversationId: string | null
    taskId: string | null
    metadata: Record<string, any> | null
    emailSentAt: Date | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function isUserOffline(userId: string): Promise<boolean> {
    const presence = await prisma.userPresence.findUnique({ where: { userId } })
    if (!presence) return true // never connected = offline
    if (presence.status === 'OFFLINE') return true
    return presence.lastHeartbeat < new Date(Date.now() - OFFLINE_THRESHOLD_MS)
}

function isInQuietHours(start: number | null, end: number | null): boolean {
    if (start == null || end == null) return false
    const nowHour = new Date().getUTCHours()
    if (start <= end) {
        // e.g. 8→17  (daytime quiet = unusual but valid)
        return nowHour >= start && nowHour < end
    }
    // wraparound e.g. 22→7
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

function shouldOverrideMute(
    type: string,
    metadata: Record<string, any> | null,
): boolean {
    if (MUTE_OVERRIDE_TYPES.has(type)) return true
    if (metadata?.isImportant) return true
    if (metadata?.msgType === 'ANNOUNCEMENT') return true
    return false
}

/**
 * Atomically claim the notification for email sending.
 * Returns true if WE are the one who claimed it (no one else has set emailSentAt).
 */
async function claimForEmail(notificationId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
        where: { id: notificationId, emailSentAt: null },
        data: { emailSentAt: new Date() },
    })
    return result.count > 0
}

// ── Public: Realtime email ──────────────────────────────────────────────────

/**
 * Called fire-and-forget after every notification creation.
 * Decides whether to send an email immediately (REALTIME mode)
 * or leave it for the digest cron (HOURLY/DAILY).
 */
export async function maybeSendNotificationEmail(
    notification: NotificationForEmail,
    recipientEmail: string | null,
): Promise<void> {
    try {
        // 1. Dedup
        if (notification.emailSentAt) return

        // 2. No email on file
        if (!recipientEmail) return

        // 3. Skip types that have their own dedicated emails
        if (TYPES_WITH_DEDICATED_EMAIL.has(notification.type)) return

        // 4. Load preferences (lazy create defaults)
        const pref = await prisma.notificationPreference.findUnique({
            where: { userId: notification.userId },
        })
        const emailEnabled = pref?.emailEnabled ?? true
        const digestMode = pref?.emailDigestMode ?? 'REALTIME'

        if (!emailEnabled || digestMode === 'OFF') return

        // 5. Non-REALTIME → cron picks it up
        if (digestMode === 'HOURLY' || digestMode === 'DAILY') return

        // 6. REALTIME path
        // 6a. Quiet hours
        if (isInQuietHours(pref?.quietHoursStart ?? null, pref?.quietHoursEnd ?? null)) return

        // 6b. User online → skip
        const offline = await isUserOffline(notification.userId)
        if (!offline) return

        // 6c. Conversation mute check
        if (notification.conversationId) {
            const muted = await isConversationMutedForUser(
                notification.userId,
                notification.conversationId,
            )
            if (muted && !shouldOverrideMute(notification.type, notification.metadata)) return
        }

        // 6d. Atomically claim
        const claimed = await claimForEmail(notification.id)
        if (!claimed) return // someone else (cron?) already sent it

        // 6e. Render & send
        const user = await prisma.user.findUnique({
            where: { id: notification.userId },
            select: { username: true, nickname: true },
        })
        const userName = user?.nickname || user?.username || 'User'

        const html = emailTemplates.notificationRealtime(
            userName,
            {
                type: notification.type,
                title: notification.title,
                body: notification.body,
                conversationId: notification.conversationId,
                taskId: notification.taskId,
            },
            APP_URL,
        )

        await sendEmail({
            to: recipientEmail,
            subject: notification.title,
            html,
        })
    } catch (err) {
        // Fire-and-forget — log but never throw
        console.error('[notification-email] maybeSendNotificationEmail error:', err)
    }
}

// ── Public: Digest email ────────────────────────────────────────────────────

/**
 * Processes all pending email notifications for users whose digest mode
 * matches the given mode. Called by the cron route.
 */
export async function sendDigestEmails(
    mode: 'HOURLY' | 'DAILY',
): Promise<{ sent: number; skipped: number }> {
    let sent = 0
    let skipped = 0

    try {
        // Find all users with matching digest mode
        const prefs = await prisma.notificationPreference.findMany({
            where: { emailDigestMode: mode, emailEnabled: true },
            select: { userId: true, quietHoursStart: true, quietHoursEnd: true },
        })

        for (const pref of prefs) {
            try {
                // Skip if in quiet hours (for HOURLY — next run outside quiet hours will catch)
                if (mode === 'HOURLY' && isInQuietHours(pref.quietHoursStart, pref.quietHoursEnd)) {
                    skipped++
                    continue
                }

                // Find unsent, non-archived notifications
                const notifications = await prisma.notification.findMany({
                    where: {
                        userId: pref.userId,
                        emailSentAt: null,
                        isArchived: false,
                        // Skip types with dedicated emails
                        type: { notIn: ['TASK_ASSIGNED', 'TASK_UNASSIGNED', 'TASK_STATUS_CHANGED', 'TASK_COMMENT'] as any },
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 50, // cap per user per digest
                })

                if (notifications.length === 0) {
                    skipped++
                    continue
                }

                // Load user email
                const user = await prisma.user.findUnique({
                    where: { id: pref.userId },
                    select: { email: true, username: true, nickname: true },
                })

                if (!user?.email) {
                    skipped++
                    continue
                }

                const userName = user.nickname || user.username || 'User'

                // Render digest
                const html = emailTemplates.notificationDigest(
                    userName,
                    notifications.map(n => ({
                        type: n.type,
                        title: n.title,
                        body: n.body,
                        createdAt: n.createdAt.toISOString(),
                    })),
                    APP_URL,
                )

                await sendEmail({
                    to: user.email,
                    subject: `[AgencyManager] Bạn có ${notifications.length} thông báo mới`,
                    html,
                })

                // Stamp all as emailed
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
