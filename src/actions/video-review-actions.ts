'use server'

/**
 * [Video Review] PUBLIC token-gated actions for the Frame.io-style review
 * portal. Mirrors share-portal-actions.ts exactly: the token IS the credential
 * (no session), every call re-resolves through resolveShareToken and authorizes
 * strictly via `task.clientId ∈ scope.clientIds` + `task.workspaceId ∈
 * scope.workspaceIds` + `isArchived:false`.
 *
 * Hard rules:
 *   - Client comment reads are hard-filtered `visibility='CLIENT'` server-side
 *     (INTERNAL editor notes NEVER reach the token portal).
 *   - Playback is gated: we mint a short-lived SIGNED Stream token per load and
 *     the raw Stream UID is never serialized to the client.
 *   - No internal fields (jobPriceUSD/wage/…) are ever returned here.
 */

import { prisma } from '@/lib/db'
import { sanitizeClientText, FEEDBACK_MAX_LEN } from '@/lib/sanitize'
import { rateLimit } from '@/lib/rate-limit'
import { resolveShareToken, getRequestIp, type ShareLinkScope } from '@/lib/share-link-auth'
import { createNotificationInternal } from './notification-actions'
import { broadcastNotificationToUser } from '@/lib/notification-broadcast'
import { audit } from '@/lib/audit-log'
import { revalidatePath } from 'next/cache'
import {
    canSignPlayback,
    isStreamConfigured,
    getStreamVideo,
    mintSignedPlaybackToken,
    streamManifestUrl,
    streamIframeUrl,
    streamThumbnailUrl,
} from '@/lib/cloudflare-stream'
import { broadcastReviewEvent, REVIEW_EVENTS } from '@/lib/review-realtime'
import type { ReviewCommentDTO, ReviewVersionDTO, ReviewSnapshot } from '@/components/portal/calm/review-types'

const COMMENT_MAX_LEN = FEEDBACK_MAX_LEN

interface ShareCaps {
    allowVideoComments: boolean
    canApprove: boolean
    allowDownload: boolean
    showAllVersions: boolean
}

/**
 * Resolve token → the owned task (scope-checked) + this link's capability flags.
 * Selects the task fields the review actions need (incl. staff routing ids +
 * clientReview for status sync). Returns nulls on any failure (uniform).
 */
async function resolveReview(token: string, taskId: string): Promise<{
    scope: ShareLinkScope | null
    task: {
        id: string; title: string; status: string; workspaceId: string | null
        assigneeId: string | null; assignedById: string | null
        clientReview: string | null; currentVersionId: string | null
    } | null
    caps: ShareCaps | null
}> {
    const scope = await resolveShareToken(token)
    if (!scope) return { scope: null, task: null, caps: null }

    const [task, link] = await Promise.all([
        prisma.task.findFirst({
            where: {
                id: taskId,
                clientId: { in: scope.clientIds },
                workspaceId: { in: scope.workspaceIds },
                isArchived: false,
            },
            select: {
                id: true, title: true, status: true, workspaceId: true,
                assigneeId: true, assignedById: true, clientReview: true, currentVersionId: true,
            },
        }),
        prisma.clientShareLink.findUnique({
            where: { id: scope.shareLinkId },
            select: { allowVideoComments: true, canApprove: true, allowDownload: true, showAllVersions: true },
        }),
    ])
    if (!task || !link) return { scope, task: null, caps: null }
    return { scope, task, caps: link }
}

/** Fan-out to the assignee + assigning admin (port of share-portal-actions notifyStaff). */
async function notifyStaff(
    task: { assigneeId: string | null; assignedById: string | null },
    taskId: string,
    title: string,
    body: string,
) {
    const recipients = new Set<string>()
    if (task.assigneeId) recipients.add(task.assigneeId)
    if (task.assignedById) recipients.add(task.assignedById)
    for (const uid of recipients) {
        try {
            const notif = await createNotificationInternal({ userId: uid, type: 'TASK_STATUS_CHANGED', title, body, taskId, actorId: undefined })
            void broadcastNotificationToUser(uid, { id: notif.id, type: notif.type, title: notif.title, body: notif.body, taskId, createdAt: notif.createdAt, isRead: false })
        } catch (e) {
            console.error('[video-review] notify failed', e)
        }
    }
}

/* ── Read ─────────────────────────────────────────────────────────────────── */

/** Full review snapshot for a deliverable: versions (signed playback) + the
 *  current version's CLIENT-visible comments. */
export async function getReviewViaToken(token: string, taskId: string): Promise<ReviewSnapshot | null> {
    const { scope, task, caps } = await resolveReview(token, taskId)
    if (!scope || !task || !caps) return null

    const allVersions = await prisma.videoVersion.findMany({
        where: { taskId },
        orderBy: { versionNumber: 'asc' },
        select: {
            id: true, versionNumber: true, label: true, ready: true, status: true,
            durationSec: true, fps: true, streamUid: true, createdAt: true,
        },
    })
    if (allVersions.length === 0) {
        return {
            taskId: task.id, taskTitle: task.title, clientName: scope.clientName,
            versions: [], currentVersionId: null, comments: [],
            caps: { allowVideoComments: caps.allowVideoComments, canApprove: caps.canApprove, allowDownload: caps.allowDownload },
        }
    }

    // Poll fallback: if the Stream webhook hasn't landed yet (e.g. local dev
    // can't receive it), backfill readiness on load so playback works anyway.
    if (isStreamConfigured()) {
        await Promise.all(
            allVersions.filter((v) => !v.ready && v.streamUid).map(async (v) => {
                try {
                    const d = await getStreamVideo(v.streamUid!)
                    if (d?.readyToStream) {
                        await prisma.videoVersion.update({
                            where: { id: v.id },
                            data: { ready: true, ...(d.durationSec != null ? { durationSec: d.durationSec } : {}) },
                        })
                        v.ready = true
                        if (d.durationSec != null) v.durationSec = d.durationSec
                    }
                } catch { /* best-effort */ }
            }),
        )
    }

    const latest = allVersions[allVersions.length - 1]
    const visible = caps.showAllVersions ? allVersions : [latest]
    const currentVersionId = task.currentVersionId && visible.some(v => v.id === task.currentVersionId)
        ? task.currentVersionId
        : latest.id

    // Mint a short-lived signed token per playable version. The raw UID never
    // leaves the server — the token replaces it in the URL.
    const versions: ReviewVersionDTO[] = await Promise.all(visible.map(async (v) => {
        let manifestUrl: string | null = null
        let iframeUrl: string | null = null
        let thumbnailUrl: string | null = null
        if (v.streamUid && v.ready && canSignPlayback()) {
            try {
                const tk = await mintSignedPlaybackToken(v.streamUid, { expSeconds: 3600, downloadable: caps.allowDownload })
                manifestUrl = streamManifestUrl(tk)
                iframeUrl = streamIframeUrl(tk)
                thumbnailUrl = streamThumbnailUrl(tk, 0)
            } catch (e) {
                console.error('[video-review] sign failed', e)
            }
        }
        return {
            id: v.id, versionNumber: v.versionNumber, label: v.label, ready: v.ready, status: v.status,
            durationSec: v.durationSec, fps: v.fps, manifestUrl, iframeUrl, thumbnailUrl, createdAt: v.createdAt.toISOString(),
        }
    }))

    const rawComments = await prisma.reviewComment.findMany({
        where: { versionId: currentVersionId, visibility: 'CLIENT', parentId: null },
        orderBy: [{ timestampSec: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, body: true, timestampSec: true, frame: true, authorType: true, createdAt: true },
    })
    const comments: ReviewCommentDTO[] = rawComments.map((c) => ({
        id: c.id, body: c.body, timestampSec: c.timestampSec, frame: c.frame,
        authorType: c.authorType,
        // Anonymous client comments show the brand; staff-authored CLIENT notes show "Team".
        authorName: c.authorType === 'CLIENT' ? scope.clientName : 'Team',
        createdAt: c.createdAt.toISOString(),
    }))

    return {
        taskId: task.id, taskTitle: task.title, clientName: scope.clientName,
        versions, currentVersionId, comments,
        caps: { allowVideoComments: caps.allowVideoComments, canApprove: caps.canApprove, allowDownload: caps.allowDownload },
    }
}

/** Comments for a specific version (used when the client switches versions). */
export async function getVersionCommentsViaToken(token: string, taskId: string, versionId: string): Promise<ReviewCommentDTO[]> {
    const { scope, task } = await resolveReview(token, taskId)
    if (!scope || !task) return []
    const belongs = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true } })
    if (!belongs) return []
    const rows = await prisma.reviewComment.findMany({
        where: { versionId, visibility: 'CLIENT', parentId: null },
        orderBy: [{ timestampSec: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, body: true, timestampSec: true, frame: true, authorType: true, createdAt: true },
    })
    return rows.map((c) => ({
        id: c.id, body: c.body, timestampSec: c.timestampSec, frame: c.frame,
        authorType: c.authorType, authorName: c.authorType === 'CLIENT' ? scope.clientName : 'Team',
        createdAt: c.createdAt.toISOString(),
    }))
}

/* ── Write ────────────────────────────────────────────────────────────────── */

/** Client leaves a timecode-anchored comment on a version. */
export async function addReviewCommentViaToken(
    token: string,
    taskId: string,
    versionId: string,
    input: { body: string; timestampSec?: number | null },
): Promise<{ success: boolean; error?: string; comment?: ReviewCommentDTO }> {
    const { scope, task, caps } = await resolveReview(token, taskId)
    if (!scope || !task || !caps) return { success: false, error: 'This link is invalid or the video no longer exists.' }
    if (!caps.allowVideoComments) return { success: false, error: 'Comments are disabled for this link.' }

    const rl = await rateLimit(`review-comment:${scope.shareLinkId}`, 60, 60 * 60 * 1000)
    if (!rl.success) return { success: false, error: 'Bạn gửi quá nhiều bình luận. Vui lòng thử lại sau.' }

    const body = sanitizeClientText(input?.body || '', COMMENT_MAX_LEN)
    if (!body) return { success: false, error: 'Please write a comment.' }

    const version = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true, fps: true } })
    if (!version) return { success: false, error: 'This version no longer exists.' }

    const tsRaw = input?.timestampSec
    const timestampSec = typeof tsRaw === 'number' && isFinite(tsRaw) && tsRaw >= 0 ? tsRaw : null
    const frame = timestampSec != null && version.fps ? Math.round(timestampSec * version.fps) : null

    const created = await prisma.reviewComment.create({
        data: {
            versionId,
            visibility: 'CLIENT',
            body,
            timestampSec,
            frame,
            authorType: 'CLIENT',
            clientId: scope.clientId,          // from scope, never client input
            viaShareLinkId: scope.shareLinkId,
        },
        select: { id: true, body: true, timestampSec: true, frame: true, authorType: true, createdAt: true },
    })

    const dto: ReviewCommentDTO = {
        id: created.id, body: created.body, timestampSec: created.timestampSec, frame: created.frame,
        authorType: created.authorType, authorName: scope.clientName, createdAt: created.createdAt.toISOString(),
    }

    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'video.comment_added',
        targetType: 'ReviewComment', targetId: created.id,
        after: { taskId, versionId, timestampSec, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })
    void broadcastReviewEvent(versionId, REVIEW_EVENTS.COMMENT_NEW, dto)

    return { success: true, comment: dto }
}

/** Client approves the current version → version APPROVED + task 'Hoàn tất'. */
export async function approveReviewViaToken(token: string, taskId: string, versionId: string) {
    const { scope, task, caps } = await resolveReview(token, taskId)
    if (!scope || !task || !caps) return { success: false, error: 'This link is invalid or the video no longer exists.' }
    if (!caps.canApprove) return { success: false, error: 'Approvals are disabled for this link.' }
    if (task.status === 'Hoàn tất' || task.clientReview === 'APPROVED') {
        return { success: false, error: 'This deliverable has already been approved.' }
    }
    const version = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true } })
    if (!version) return { success: false, error: 'This version no longer exists.' }

    await prisma.$transaction([
        prisma.videoVersion.update({ where: { id: versionId }, data: { status: 'APPROVED' } }),
        prisma.task.update({
            where: { id: taskId },
            data: { status: 'Hoàn tất', deadline: null, clientReview: 'APPROVED', clientReviewedAt: new Date(), currentVersionId: versionId, version: { increment: 1 } },
        }),
    ])

    await notifyStaff(task, taskId, 'Khách đã duyệt video 🎉', `Khách hàng "${scope.clientName}" đã duyệt "${task.title}" (qua link review). Task Hoàn tất.`)
    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'video.review_approved',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status }, after: { status: 'Hoàn tất', versionId, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })
    void broadcastReviewEvent(versionId, REVIEW_EVENTS.STATUS_CHANGED, { versionId, status: 'APPROVED' })
    if (task.workspaceId) {
        try { revalidatePath(`/${task.workspaceId}/admin`); revalidatePath(`/${task.workspaceId}/dashboard`) } catch { /* best-effort */ }
    }
    return { success: true }
}

/** Client requests changes on the current version → version NEEDS_CHANGES + task 'Revision'. */
export async function requestReviewChangesViaToken(token: string, taskId: string, versionId: string, feedback: string) {
    const clean = sanitizeClientText(feedback || '', FEEDBACK_MAX_LEN)
    if (!clean) return { success: false, error: 'Please describe the changes you would like.' }

    const { scope, task, caps } = await resolveReview(token, taskId)
    if (!scope || !task || !caps) return { success: false, error: 'This link is invalid or the video no longer exists.' }
    if (task.status === 'Hoàn tất') return { success: false, error: 'This deliverable is already completed — changes can no longer be requested.' }
    const version = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true } })
    if (!version) return { success: false, error: 'This version no longer exists.' }

    await prisma.$transaction([
        prisma.videoVersion.update({ where: { id: versionId }, data: { status: 'NEEDS_CHANGES' } }),
        prisma.task.update({
            where: { id: taskId },
            data: { status: 'Revision', deadline: null, clientReview: 'CHANGES', clientFeedback: clean, clientReviewedAt: new Date(), currentVersionId: versionId, version: { increment: 1 } },
        }),
    ])

    await notifyStaff(task, taskId, 'Khách yêu cầu chỉnh sửa video', `Khách hàng "${scope.clientName}" yêu cầu chỉnh sửa "${task.title}" (qua link review): ${clean.slice(0, 160)}`)
    void audit({
        workspaceId: task.workspaceId, actorUserId: null, action: 'video.changes_requested',
        targetType: 'Task', targetId: taskId,
        before: { status: task.status }, after: { status: 'Revision', versionId, feedback: clean, viaShareLinkId: scope.shareLinkId, ip: await getRequestIp() },
    })
    void broadcastReviewEvent(versionId, REVIEW_EVENTS.STATUS_CHANGED, { versionId, status: 'NEEDS_CHANGES' })
    if (task.workspaceId) {
        try { revalidatePath(`/${task.workspaceId}/admin`); revalidatePath(`/${task.workspaceId}/dashboard`) } catch { /* best-effort */ }
    }
    return { success: true }
}
