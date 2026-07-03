'use server'

/**
 * [Video Review] STAFF (session-gated) actions for the review portal — the
 * editor/admin side. Distinct from video-review-actions.ts (public, token-only):
 * these require a real session with workspace access. The editor uploads a new
 * cut here; the client reviews it through the token portal.
 */

import { prisma } from '@/lib/db'
import { verifyWorkspaceAccess } from '@/lib/security'
import { audit } from '@/lib/audit-log'
import { sanitizeClientText, FEEDBACK_MAX_LEN } from '@/lib/sanitize'
import {
    createDirectUpload, isStreamConfigured, getStreamVideo,
    canSignPlayback, mintSignedPlaybackToken, streamIframeUrl,
} from '@/lib/cloudflare-stream'
import { broadcastReviewEvent, broadcastTaskReviewEvent, REVIEW_EVENTS } from '@/lib/review-realtime'
import type { StaffReviewSnapshot, StaffReviewCommentDTO, StaffReviewVersionDTO } from '@/components/portal/calm/review-types'

const MAX_UPLOAD_DURATION_SEC = 1200 // reservation cap; unused portion is released by Stream

/**
 * Mint a one-time Cloudflare Stream upload URL for a NEW version of a
 * deliverable and create the (not-yet-ready) VideoVersion row. The editor's
 * browser uploads the file straight to `uploadURL`; the Stream webhook later
 * flips `ready=true` and backfills duration/thumbnail.
 */
export async function requestVersionUpload(
    taskId: string,
    opts?: { label?: string },
): Promise<{ success: boolean; error?: string; uploadURL?: string; uid?: string; versionId?: string; versionNumber?: number }> {
    if (!isStreamConfigured()) {
        return { success: false, error: 'Cloudflare Stream chưa được cấu hình (thiếu CLOUDFLARE_* env).' }
    }

    const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { id: true, workspaceId: true, title: true },
    })
    if (!task || !task.workspaceId) {
        return { success: false, error: 'Task không tồn tại hoặc chưa thuộc workspace.' }
    }

    // Session + workspace authorization (throws SECURITY_VIOLATION on failure).
    let userId: string
    try {
        const auth = await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
        userId = auth.userId
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }

    // Next version number for this deliverable (V1, V2, V3…).
    const last = await prisma.videoVersion.findFirst({
        where: { taskId },
        orderBy: { versionNumber: 'desc' },
        select: { versionNumber: true },
    })
    const versionNumber = (last?.versionNumber ?? 0) + 1

    // Mint the direct-creator upload (video created private / requireSignedURLs).
    let upload: { uploadURL: string; uid: string }
    try {
        upload = await createDirectUpload({
            maxDurationSeconds: MAX_UPLOAD_DURATION_SEC,
            meta: { taskId, versionNumber: String(versionNumber) },
        })
    } catch (e: any) {
        console.error('[video-review-staff] createDirectUpload failed', e)
        const msg = String(e?.message ?? '')
        // Most common pre-subscription failure: no storage quota (413 / code 10011).
        if (msg.includes('Storage capacity') || msg.includes('10011') || msg.includes('(413)')) {
            return { success: false, error: 'Cloudflare Stream chưa bật gói lưu trữ (quota = 0). Vào Cloudflare → Media → Stream → View plans để subscribe, rồi thử lại.' }
        }
        return { success: false, error: 'Không tạo được link upload Cloudflare Stream. Kiểm tra lại cấu hình Stream.' }
    }

    // Create the version row + point the deliverable at it and flag the client
    // that a review cut is coming (clientReview='AWAITING').
    let version: { id: string }
    try {
        version = await prisma.$transaction(async (tx) => {
            const v = await tx.videoVersion.create({
                data: {
                    taskId,
                    versionNumber,
                    label: opts?.label?.trim() || null,
                    streamUid: upload.uid,
                    ready: false,
                    status: 'NEEDS_REVIEW',
                    createdByUserId: userId,
                },
                select: { id: true },
            })
            await tx.task.update({
                where: { id: taskId },
                data: { currentVersionId: v.id, clientReview: 'AWAITING', clientReviewedAt: null },
            })
            return v
        })
    } catch (e) {
        console.error('[video-review-staff] version row create failed', e)
        return { success: false, error: 'Không lưu được phiên bản. Vui lòng thử lại.' }
    }

    void audit({
        workspaceId: task.workspaceId, actorUserId: userId, action: 'video.version_uploaded',
        targetType: 'VideoVersion', targetId: version.id,
        after: { taskId, versionNumber, streamUid: upload.uid },
    })

    return { success: true, uploadURL: upload.uploadURL, uid: upload.uid, versionId: version.id, versionNumber }
}

/** Staff-side list of a deliverable's versions (for the editor's upload panel). */
export async function listTaskVersions(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true, currentVersionId: true } })
    if (!task || !task.workspaceId) return { success: false as const, error: 'Task không tồn tại.' }
    try {
        await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
    } catch (e: any) {
        return { success: false as const, error: e?.message ?? 'Unauthorized' }
    }
    const versions = await prisma.videoVersion.findMany({
        where: { taskId },
        orderBy: { versionNumber: 'desc' },
        select: { id: true, versionNumber: true, label: true, ready: true, status: true, durationSec: true, streamUid: true, createdAt: true },
    })
    // Poll fallback for readiness when the webhook hasn't arrived (local dev).
    if (isStreamConfigured()) {
        await Promise.all(
            versions.filter((v) => !v.ready && v.streamUid).map(async (v) => {
                try {
                    const d = await getStreamVideo(v.streamUid!)
                    if (d?.readyToStream) {
                        await prisma.videoVersion.update({ where: { id: v.id }, data: { ready: true, ...(d.durationSec != null ? { durationSec: d.durationSec } : {}) } })
                        v.ready = true
                    }
                } catch { /* best-effort */ }
            }),
        )
    }
    return {
        success: true as const,
        currentVersionId: task.currentVersionId,
        versions: versions.map(({ streamUid, ...v }) => ({ ...v, createdAt: v.createdAt.toISOString() })),
    }
}

/* ── Staff review thread (player + internal/client comments + reply/resolve) ──
 * The editor side of the Frame.io loop. Session-gated (verifyWorkspaceAccess);
 * returns BOTH internal + client comments (threaded) — NEVER exposed to the
 * token portal. Isolation on realtime: internal content never rides a client-
 * facing channel (see the broadcast rules in postStaffReviewComment). */

/** Build the threaded comment list (both visibilities) for a version. */
async function buildStaffThread(versionId: string): Promise<StaffReviewCommentDTO[]> {
    const rows = await prisma.reviewComment.findMany({
        where: { versionId },
        orderBy: { createdAt: 'asc' },
        select: {
            id: true, body: true, timestampSec: true, frame: true, authorType: true,
            authorUserId: true, clientId: true, visibility: true, completed: true,
            completedAt: true, parentId: true, createdAt: true,
        },
    })
    if (rows.length === 0) return []

    // Resolve author display names (scalar ids — no FK on the model on purpose).
    const userIds = [...new Set(rows.map((r) => r.authorUserId).filter((x): x is string => !!x))]
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is number => x != null))]
    const [users, clients] = await Promise.all([
        userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, username: true } }) : Promise.resolve([]),
        clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ])
    const userName = new Map(users.map((u) => [u.id, u.displayName?.trim() || u.username]))
    const clientName = new Map(clients.map((c) => [c.id, c.name]))

    const toDTO = (c: (typeof rows)[number]): StaffReviewCommentDTO => ({
        id: c.id, body: c.body, timestampSec: c.timestampSec, frame: c.frame,
        authorType: c.authorType,
        authorName: c.authorType === 'CLIENT'
            ? (c.clientId != null ? clientName.get(c.clientId) ?? 'Khách' : 'Khách')
            : (c.authorUserId ? userName.get(c.authorUserId) ?? 'Editor' : 'Editor'),
        visibility: c.visibility, completed: c.completed,
        completedAt: c.completedAt ? c.completedAt.toISOString() : null,
        parentId: c.parentId, createdAt: c.createdAt.toISOString(), replies: [],
    })

    const map = new Map<string, StaffReviewCommentDTO>()
    const roots: StaffReviewCommentDTO[] = []
    for (const c of rows) map.set(c.id, toDTO(c))
    for (const c of rows) {
        const d = map.get(c.id)!
        if (c.parentId && map.has(c.parentId)) map.get(c.parentId)!.replies.push(d)
        else roots.push(d) // top-level, or orphan reply whose parent was deleted
    }
    roots.sort((a, b) =>
        (a.timestampSec ?? Number.POSITIVE_INFINITY) - (b.timestampSec ?? Number.POSITIVE_INFINITY)
        || a.createdAt.localeCompare(b.createdAt))
    return roots
}

/** Full staff review snapshot: versions (signed playback) + current version's
 *  threaded comments (internal + client). */
export async function getStaffReview(taskId: string): Promise<{ success: boolean; error?: string; snapshot?: StaffReviewSnapshot }> {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, title: true, workspaceId: true, currentVersionId: true } })
    if (!task || !task.workspaceId) return { success: false, error: 'Task không tồn tại.' }
    try {
        await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }

    const allVersions = await prisma.videoVersion.findMany({
        where: { taskId },
        orderBy: { versionNumber: 'asc' },
        select: { id: true, versionNumber: true, label: true, ready: true, status: true, durationSec: true, fps: true, streamUid: true, createdAt: true },
    })
    if (allVersions.length === 0) {
        return { success: true, snapshot: { taskId: task.id, taskTitle: task.title, versions: [], currentVersionId: null, comments: [] } }
    }

    // Poll fallback for readiness when the webhook hasn't landed (local dev).
    if (isStreamConfigured()) {
        await Promise.all(
            allVersions.filter((v) => !v.ready && v.streamUid).map(async (v) => {
                try {
                    const d = await getStreamVideo(v.streamUid!)
                    if (d?.readyToStream) {
                        await prisma.videoVersion.update({ where: { id: v.id }, data: { ready: true, ...(d.durationSec != null ? { durationSec: d.durationSec } : {}) } })
                        v.ready = true
                        if (d.durationSec != null) v.durationSec = d.durationSec
                    }
                } catch { /* best-effort */ }
            }),
        )
    }

    const latest = allVersions[allVersions.length - 1]
    const currentVersionId = task.currentVersionId && allVersions.some((v) => v.id === task.currentVersionId)
        ? task.currentVersionId
        : latest.id

    const versions: StaffReviewVersionDTO[] = await Promise.all(allVersions.map(async (v) => {
        let iframeUrl: string | null = null
        if (v.streamUid && v.ready && canSignPlayback()) {
            try {
                const tk = await mintSignedPlaybackToken(v.streamUid, { expSeconds: 3600 })
                iframeUrl = streamIframeUrl(tk)
            } catch (e) { console.error('[video-review-staff] sign failed', e) }
        }
        return { id: v.id, versionNumber: v.versionNumber, label: v.label, ready: v.ready, status: v.status, durationSec: v.durationSec, fps: v.fps, iframeUrl, createdAt: v.createdAt.toISOString() }
    }))

    const comments = await buildStaffThread(currentVersionId)
    return { success: true, snapshot: { taskId: task.id, taskTitle: task.title, versions, currentVersionId, comments } }
}

/** Threaded comments for a specific version (staff switches version). */
export async function getStaffVersionComments(taskId: string, versionId: string): Promise<{ success: boolean; error?: string; comments?: StaffReviewCommentDTO[] }> {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true } })
    if (!task?.workspaceId) return { success: false, error: 'Task không tồn tại.' }
    try {
        await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }
    const belongs = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true } })
    if (!belongs) return { success: false, error: 'Phiên bản không tồn tại.' }
    return { success: true, comments: await buildStaffThread(versionId) }
}

/** Staff posts a review comment (internal or client-visible) or a reply. */
export async function postStaffReviewComment(
    taskId: string,
    versionId: string,
    input: { body: string; timestampSec?: number | null; visibility?: 'INTERNAL' | 'CLIENT'; parentId?: string | null },
): Promise<{ success: boolean; error?: string }> {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { workspaceId: true } })
    if (!task?.workspaceId) return { success: false, error: 'Task không tồn tại.' }
    let userId: string
    try {
        const auth = await verifyWorkspaceAccess(task.workspaceId, 'MEMBER')
        userId = auth.userId
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }

    const version = await prisma.videoVersion.findFirst({ where: { id: versionId, taskId }, select: { id: true, fps: true } })
    if (!version) return { success: false, error: 'Phiên bản không tồn tại.' }

    const body = sanitizeClientText(input?.body || '', FEEDBACK_MAX_LEN)
    if (!body) return { success: false, error: 'Nội dung trống.' }

    // Replies carry text only and INHERIT the parent's visibility (enforced here,
    // as the schema promises). Top-level uses the requested visibility (def CLIENT).
    let visibility: 'INTERNAL' | 'CLIENT' = input?.visibility === 'INTERNAL' ? 'INTERNAL' : 'CLIENT'
    let parentId: string | null = null
    if (input?.parentId) {
        const parent = await prisma.reviewComment.findFirst({ where: { id: input.parentId, versionId }, select: { id: true, visibility: true } })
        if (!parent) return { success: false, error: 'Bình luận gốc không tồn tại.' }
        parentId = parent.id
        visibility = parent.visibility as 'INTERNAL' | 'CLIENT'
    }

    const tsRaw = input?.timestampSec
    const timestampSec = !parentId && typeof tsRaw === 'number' && isFinite(tsRaw) && tsRaw >= 0 ? tsRaw : null
    const frame = timestampSec != null && version.fps ? Math.round(timestampSec * version.fps) : null

    const created = await prisma.reviewComment.create({
        data: { versionId, parentId, visibility, body, timestampSec, frame, authorType: 'EDITOR', authorUserId: userId },
        select: { id: true, createdAt: true },
    })

    void audit({
        workspaceId: task.workspaceId, actorUserId: userId, action: 'video.comment_added',
        targetType: 'ReviewComment', targetId: created.id, after: { taskId, versionId, visibility, parentId },
    })

    // [Isolation] The staff panel refetches (session-gated) via the task channel —
    // never put INTERNAL bodies on any wire. Only a CLIENT-visible top-level
    // comment gets a client-safe DTO pushed to the client-facing version channel.
    void broadcastTaskReviewEvent(taskId, REVIEW_EVENTS.COMMENT_NEW, { versionId })
    if (visibility === 'CLIENT' && !parentId) {
        void broadcastReviewEvent(versionId, REVIEW_EVENTS.COMMENT_NEW, {
            id: created.id, body, timestampSec, frame, authorType: 'EDITOR', authorName: 'Team', createdAt: created.createdAt.toISOString(),
        })
    }
    return { success: true }
}

/** Resolve context: comment → version → task → workspace, for authorization. */
async function resolveCommentCtx(commentId: string): Promise<{ workspaceId: string; taskId: string; versionId: string } | null> {
    const c = await prisma.reviewComment.findUnique({
        where: { id: commentId },
        select: { versionId: true, version: { select: { taskId: true, task: { select: { workspaceId: true } } } } },
    })
    const ws = c?.version?.task?.workspaceId
    if (!c || !ws) return null
    return { workspaceId: ws, taskId: c.version.taskId, versionId: c.versionId }
}

/** Editor ticks a note off as addressed (independent of review status). */
export async function resolveReviewComment(commentId: string): Promise<{ success: boolean; error?: string }> {
    const ctx = await resolveCommentCtx(commentId)
    if (!ctx) return { success: false, error: 'Bình luận không tồn tại.' }
    let userId: string
    try {
        const auth = await verifyWorkspaceAccess(ctx.workspaceId, 'MEMBER')
        userId = auth.userId
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }
    await prisma.reviewComment.update({ where: { id: commentId }, data: { completed: true, completedAt: new Date(), completedByUserId: userId } })
    void audit({ workspaceId: ctx.workspaceId, actorUserId: userId, action: 'video.comment_resolved', targetType: 'ReviewComment', targetId: commentId, after: { completed: true } })
    void broadcastTaskReviewEvent(ctx.taskId, REVIEW_EVENTS.COMMENT_UPDATED, { versionId: ctx.versionId })
    return { success: true }
}

/** Reopen a resolved note. */
export async function reopenReviewComment(commentId: string): Promise<{ success: boolean; error?: string }> {
    const ctx = await resolveCommentCtx(commentId)
    if (!ctx) return { success: false, error: 'Bình luận không tồn tại.' }
    let userId: string
    try {
        const auth = await verifyWorkspaceAccess(ctx.workspaceId, 'MEMBER')
        userId = auth.userId
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Unauthorized' }
    }
    await prisma.reviewComment.update({ where: { id: commentId }, data: { completed: false, completedAt: null, completedByUserId: null } })
    void audit({ workspaceId: ctx.workspaceId, actorUserId: userId, action: 'video.comment_reopened', targetType: 'ReviewComment', targetId: commentId, after: { completed: false } })
    void broadcastTaskReviewEvent(ctx.taskId, REVIEW_EVENTS.COMMENT_UPDATED, { versionId: ctx.versionId })
    return { success: true }
}
