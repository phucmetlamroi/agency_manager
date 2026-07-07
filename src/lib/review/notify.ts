// [Review module P6.1] Notification fan-out for the review module (FR-G02).
// Thin wrapper over the app's existing createAndBroadcastNotifications (bell +
// realtime + web-push all handled there) with the review specifics baked in:
//   - the ACTOR is always excluded (the app helper does NOT self-filter);
//   - `taskId` is set so the bell navigates to the task drawer (its only nav
//     target), while the richer player deep-link rides in `metadata.url` (used
//     by web-push);
//   - recipient resolution: task assignee + the task's PROFILE admins (OWNER/
//     ADMIN) — mirrors notifyProfileAdmins/notifyStaff elsewhere in the app.
// Fire-and-forget: a notification failure must NEVER break the comment/decision
// path that triggered it, so callers `void` this (it swallows + logs internally).

import { prisma } from '@/lib/db'
import type { NotificationType } from '@prisma/client'
import { createAndBroadcastNotifications } from '@/actions/notification-actions'
import { reviewLog } from './logger'

/** Deep-link to the exact player position (web-push url; the bell uses taskId). */
export function reviewPlayerUrl(input: {
    workspaceId: string
    assetId: string
    versionId?: string | null
    commentId?: string | null
}): string {
    const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://hustlytasker.xyz').replace(/\/$/, '')
    const qs = new URLSearchParams()
    if (input.versionId) qs.set('v', input.versionId)
    if (input.commentId) qs.set('comment', input.commentId)
    const suffix = qs.toString()
    return `${base}/${input.workspaceId}/team/asset/${input.assetId}${suffix ? `?${suffix}` : ''}`
}

/** Assignee + the task's profile OWNER/ADMIN (deduped). Empty when no task. */
export async function resolveTaskRecipients(
    taskId: string | null | undefined,
): Promise<{ assigneeId: string | null; adminUserIds: string[]; title: string }> {
    if (!taskId) return { assigneeId: null, adminUserIds: [], title: '' }
    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { title: true, assigneeId: true, profileId: true },
    })
    if (!task) return { assigneeId: null, adminUserIds: [], title: '' }
    const admins = task.profileId
        ? await prisma.profileAccess.findMany({
              where: { profileId: task.profileId, role: { in: ['OWNER', 'ADMIN'] } },
              select: { userId: true },
          })
        : []
    return { assigneeId: task.assigneeId, adminUserIds: admins.map((a) => a.userId), title: task.title }
}

export interface ReviewNotifyInput {
    recipientIds: (string | null | undefined)[]
    /** the actor — never notify them of their own action */
    excludeUserId?: string | null
    type: NotificationType
    title: string
    body: string
    taskId?: string | null
    deepLinkUrl?: string
    actorId?: string | null
    avatarUrl?: string | null
    /** extra metadata merged with {url} (e.g. {suggestComplete:true} for approve). */
    meta?: Record<string, unknown>
}

/** Fan out one review notification. Deduped + actor-excluded; never throws. */
export async function notifyReview(input: ReviewNotifyInput): Promise<void> {
    const ids = [...new Set(input.recipientIds.filter((x): x is string => !!x))].filter(
        (id) => id !== input.excludeUserId,
    )
    if (!ids.length) return
    try {
        await createAndBroadcastNotifications(ids, {
            type: input.type,
            title: input.title,
            body: input.body,
            taskId: input.taskId ?? null,
            actorId: input.actorId ?? null,
            avatarUrl: input.avatarUrl ?? null,
            metadata: { ...(input.meta ?? {}), ...(input.deepLinkUrl ? { url: input.deepLinkUrl } : {}) },
        })
    } catch (e) {
        reviewLog('error', 'notify.failed', { type: input.type, count: ids.length, error: String(e) })
    }
}
