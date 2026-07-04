// [Review module] Inngest client + P0 function skeletons (KIEN-TRUC §6.1).
// P0 proves the pipeline end-to-end (webhook → event → function run) with
// log-only steps; P1 fills in the real Mux processing, P6 the janitor children.

import { Inngest } from 'inngest'
import { ReviewMediaKind, ReviewPipelineStatus, ReviewState } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reviewLog } from './logger'
import { createMuxAsset, deleteMuxAsset, extractReadyMeta, type MuxAsset } from './mux'
import { presignGetObject, getObjectRange } from './r2'
import { looksLikeMedia } from './upload-helpers'
import { recordActivity, REVIEW_ACTIVITY } from './activity'

export const inngest = new Inngest({ id: 'hustlytasker-review' })

/** Event names — single source of truth for senders + functions. */
export const REVIEW_EVENTS = {
    MUX_EVENT_RECEIVED: 'review/mux.event.received',
    JANITOR_REQUESTED: 'review/janitor.requested',
    // Emitted by the complete route after R2 CompleteMultipartUpload for a VIDEO:
    // the heavy Mux create-asset call runs in the Inngest handler (P1.4), keeping
    // the request well under Vercel's function timeout.
    UPLOAD_COMPLETED: 'review/upload.completed',
} as const

/**
 * P1.3: consume a Mux webhook (video.asset.ready / video.asset.errored) and apply
 * it to the ReviewVersion identified by the asset's `passthrough` (= versionId).
 *
 * Retry-safe by construction: the heavy apply runs FIRST (idempotent — guarded by
 * an atomic pipelineStatus flip so a redelivered/retried event writes the activity
 * at most once), and only THEN is WebhookEvent.processedAt set. If the apply throws,
 * processedAt stays null → Inngest retries (and the nightly reconcile re-enqueues).
 */
export const reviewMuxWebhook = inngest.createFunction(
    // Inngest v4 API: triggers live inside the config object (2-arg form).
    { id: 'review-mux-webhook', retries: 4, triggers: [{ event: REVIEW_EVENTS.MUX_EVENT_RECEIVED }] },
    async ({ event, step }) => {
        const webhookEventId = event.data?.webhookEventId as string | undefined
        if (!webhookEventId) {
            reviewLog('warn', 'inngest.mux_webhook.missing_id', {})
            return { skipped: true }
        }

        const ledger = await step.run('load-event', async () => {
            const row = await prisma.webhookEvent.findUnique({ where: { id: webhookEventId } })
            if (!row) return { missing: true as const }
            return {
                missing: false as const,
                alreadyProcessed: row.processedAt != null,
                type: (row.payload as { type?: string } | null)?.type ?? row.type,
                asset: ((row.payload as { data?: MuxAsset } | null)?.data ?? null) as MuxAsset | null,
            }
        })
        if (ledger.missing) {
            reviewLog('warn', 'inngest.mux_webhook.ledger_missing', { webhookEventId })
            return { skipped: true }
        }
        if (ledger.alreadyProcessed) {
            reviewLog('info', 'inngest.mux_webhook.duplicate_skip', { webhookEventId })
            return { duplicate: true }
        }

        const isReady = ledger.type === 'video.asset.ready'
        const isErrored = ledger.type === 'video.asset.errored'
        const versionId = ledger.asset?.passthrough

        if ((isReady || isErrored) && versionId) {
            await step.run('apply', async () => {
                const version = await prisma.reviewVersion.findFirst({
                    where: { id: versionId },
                    include: { asset: { select: { taskId: true } } },
                })
                if (!version) {
                    reviewLog('warn', 'inngest.mux_webhook.version_missing', { webhookEventId, versionId })
                    return { orphan: true }
                }

                if (isReady) {
                    const meta = extractReadyMeta(ledger.asset as MuxAsset)
                    // Atomic (flip + head + activity in ONE tx): a redelivered event finds it already
                    // READY (flip count 0) and writes nothing ("3× dup ⇒ 1 activity"); a mid-apply
                    // failure rolls back the flip so the Inngest retry re-applies cleanly.
                    const outcome = await prisma.$transaction(async (tx) => {
                        const flip = await tx.reviewVersion.updateMany({
                            where: { id: versionId, pipelineStatus: ReviewPipelineStatus.PROCESSING },
                            data: {
                                pipelineStatus: ReviewPipelineStatus.READY,
                                reviewState: ReviewState.AWAITING_REVIEW,
                                readyAt: new Date(),
                                muxAssetId: (ledger.asset as MuxAsset).id ?? version.muxAssetId,
                                muxPlaybackId: meta.muxPlaybackId,
                                durationMs: meta.durationMs,
                                fpsNumerator: meta.fpsNumerator,
                                fpsDenominator: meta.fpsDenominator,
                                width: meta.width,
                                height: meta.height,
                                videoCodec: meta.videoCodec,
                                audioCodec: meta.audioCodec,
                            },
                        })
                        if (flip.count === 0) return 'noop'
                        // The newest ready version becomes the stack head.
                        await tx.reviewAsset.update({ where: { id: version.assetId }, data: { currentVersionId: versionId } })
                        await recordActivity(tx, {
                            type: REVIEW_ACTIVITY.VERSION_READY,
                            workspaceId: version.workspaceId,
                            taskId: version.asset.taskId,
                            assetId: version.assetId,
                            versionId,
                            actorUserId: version.uploaderId,
                            meta: { versionNumber: version.versionNumber, durationMs: meta.durationMs },
                        })
                        return 'applied'
                    })
                    if (outcome === 'noop') {
                        // flip.count===0 → either already READY (a redelivered event = real noop) or the
                        // version is in an UNEXPECTED pre-ready state (early webhook / crash). In the
                        // latter case DON'T let mark-processed swallow the event — throw so Inngest
                        // retries and, failing that, the nightly reconcile re-enqueues it.
                        const cur = await prisma.reviewVersion.findUnique({
                            where: { id: versionId },
                            select: { pipelineStatus: true },
                        })
                        if (cur && cur.pipelineStatus !== ReviewPipelineStatus.READY) {
                            throw new Error(`ready webhook for version ${versionId} in state ${cur.pipelineStatus} — retry`)
                        }
                    }
                    reviewLog('info', `inngest.mux_webhook.ready_${outcome}`, { versionId, durationMs: meta.durationMs })
                    return { applied: outcome === 'applied' ? 'ready' : 'noop' }
                }

                // errored
                const msg = (ledger.asset as MuxAsset).errors?.messages?.join('; ') || 'Mux xử lý video thất bại.'
                const outcome = await prisma.$transaction(async (tx) => {
                    const flip = await tx.reviewVersion.updateMany({
                        where: {
                            id: versionId,
                            pipelineStatus: { in: [ReviewPipelineStatus.PROCESSING, ReviewPipelineStatus.UPLOADED] },
                        },
                        data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: msg },
                    })
                    if (flip.count === 0) return 'noop'
                    await recordActivity(tx, {
                        type: REVIEW_ACTIVITY.VERSION_ERROR,
                        workspaceId: version.workspaceId,
                        taskId: version.asset.taskId,
                        assetId: version.assetId,
                        versionId,
                        actorUserId: version.uploaderId,
                        meta: { versionNumber: version.versionNumber, errorMessage: msg },
                    })
                    return 'applied'
                })
                reviewLog('warn', `inngest.mux_webhook.errored_${outcome}`, { versionId, msg })
                return { applied: outcome === 'applied' ? 'errored' : 'noop' }
            })
        } else {
            reviewLog('info', 'inngest.mux_webhook.ignored', { webhookEventId, type: ledger.type, hasVersion: !!versionId })
        }

        // Persist-then-claim: mark processed LAST so a mid-apply failure is retried.
        await step.run('mark-processed', async () => {
            await prisma.webhookEvent.updateMany({
                where: { id: webhookEventId, processedAt: null },
                data: { processedAt: new Date() },
            })
            return true
        })
        return { processed: true, type: ledger.type }
    },
)

/**
 * P1.4: after the complete route finalizes a VIDEO on R2 it emits review/upload.completed.
 * Here (off the request path) we cheaply sniff the object's magic bytes, then ask Mux to
 * pull the original from a presigned R2 GET. The version stays PROCESSING until the Mux
 * webhook (reviewMuxWebhook) flips it READY. Inngest step memoization makes the Mux
 * create-asset call fire at most once even across retries.
 */
export const reviewProcessUpload = inngest.createFunction(
    { id: 'review-process-upload', retries: 4, triggers: [{ event: REVIEW_EVENTS.UPLOAD_COMPLETED }] },
    async ({ event, step }) => {
        const versionId = event.data?.versionId as string | undefined
        if (!versionId) {
            reviewLog('warn', 'inngest.process_upload.missing_id', {})
            return { skipped: true }
        }

        const v = await step.run('load-version', async () => {
            const row = await prisma.reviewVersion.findFirst({
                where: { id: versionId },
                include: { asset: { select: { taskId: true } } },
            })
            if (!row) return null
            return {
                pipelineStatus: row.pipelineStatus,
                mediaKind: row.mediaKind,
                r2Key: row.r2Key,
                muxAssetId: row.muxAssetId,
                workspaceId: row.workspaceId,
                assetId: row.assetId,
                taskId: row.asset.taskId,
                versionNumber: row.versionNumber,
                uploaderId: row.uploaderId,
            }
        })
        // Only act on a video still awaiting Mux (idempotent: a retry after muxAssetId is set skips).
        if (!v) {
            reviewLog('info', 'inngest.process_upload.gone', { versionId })
            return { skipped: true }
        }
        if (v.mediaKind !== ReviewMediaKind.VIDEO || v.pipelineStatus !== ReviewPipelineStatus.PROCESSING || v.muxAssetId || !v.r2Key) {
            reviewLog('info', 'inngest.process_upload.noop', { versionId, status: v.pipelineStatus, hasMux: !!v.muxAssetId })
            return { skipped: true }
        }

        // Cheap content gate — reject obvious junk (a text file renamed .mp4) before paying Mux.
        const looksVideo = await step.run('verify-content', async () => {
            try {
                const head = await getObjectRange(v.r2Key as string, 0, 4095)
                return looksLikeMedia('VIDEO', head)
            } catch (e) {
                // Can't read the object → treat as unverifiable but let Mux be the real gate.
                reviewLog('warn', 'inngest.process_upload.head_failed', { versionId, error: String(e) })
                return true
            }
        })
        if (!looksVideo) {
            await step.run('reject-content', async () => {
                await prisma.$transaction(async (tx) => {
                    const flip = await tx.reviewVersion.updateMany({
                        where: { id: versionId, pipelineStatus: ReviewPipelineStatus.PROCESSING },
                        data: { pipelineStatus: ReviewPipelineStatus.FAILED, errorMessage: 'Nội dung tệp không phải video hợp lệ.' },
                    })
                    if (flip.count === 0) return
                    await recordActivity(tx, {
                        type: REVIEW_ACTIVITY.VERSION_ERROR,
                        workspaceId: v.workspaceId,
                        taskId: v.taskId,
                        assetId: v.assetId,
                        versionId,
                        actorUserId: v.uploaderId,
                        meta: { versionNumber: v.versionNumber, errorMessage: 'magic-bytes' },
                    })
                })
                return true
            })
            reviewLog('warn', 'inngest.process_upload.rejected', { versionId })
            return { rejected: true }
        }

        // Create the Mux asset from a presigned R2 GET (24h). Memoized across THIS run's retries →
        // one asset per run. The pre-check narrows the (rare) concurrent-run double-create window.
        const created = await step.run('create-mux-asset', async () => {
            const cur = await prisma.reviewVersion.findUnique({ where: { id: versionId }, select: { muxAssetId: true } })
            if (cur?.muxAssetId) return { assetId: cur.muxAssetId, mine: false } // a concurrent run already made one
            const inputUrl = await presignGetObject(v.r2Key as string, { expiresIn: 24 * 60 * 60 })
            const asset = await createMuxAsset({ inputUrl, passthrough: versionId })
            return { assetId: asset.id, mine: true }
        })

        if (created.mine) {
            // Store the id (only while still PROCESSING & unset). Only OUR asset may be orphan-deleted.
            await step.run('store-mux-id', async () => {
                const res = await prisma.reviewVersion.updateMany({
                    where: { id: versionId, pipelineStatus: ReviewPipelineStatus.PROCESSING, muxAssetId: null },
                    data: { muxAssetId: created.assetId },
                })
                if (res.count === 0) {
                    // A concurrent run already set a (different) asset — ours is the orphan → delete it.
                    reviewLog('warn', 'inngest.process_upload.duplicate_asset', { versionId, muxAssetId: created.assetId })
                    await deleteMuxAsset(created.assetId).catch(() => {})
                }
                return res.count
            })
        }
        reviewLog('info', 'inngest.process_upload.created', { versionId, muxAssetId: created.assetId, mine: created.mine })
        return { muxAssetId: created.assetId }
    },
)

/**
 * P0 skeleton: nightly janitor fan-out (no-op children). P1 adds
 * review/multipart-abort + review/reconcile; P6 adds review/trash-purge.
 */
export const reviewJanitor = inngest.createFunction(
    { id: 'review-janitor', triggers: [{ event: REVIEW_EVENTS.JANITOR_REQUESTED }] },
    async ({ step }) => {
        await step.run('fan-out', async () => {
            reviewLog('info', 'inngest.janitor.run', { children: 'none-yet (P0 skeleton)' })
            return true
        })
        return { ok: true }
    },
)

export const reviewFunctions = [reviewMuxWebhook, reviewProcessUpload, reviewJanitor]
