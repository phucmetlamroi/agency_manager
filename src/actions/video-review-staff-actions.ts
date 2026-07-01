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
import { createDirectUpload, isStreamConfigured, getStreamVideo } from '@/lib/cloudflare-stream'

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
