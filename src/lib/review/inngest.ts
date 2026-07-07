// [Review module] Inngest client + P0 function skeletons (KIEN-TRUC §6.1).
// P0 proves the pipeline end-to-end (webhook → event → function run) with
// log-only steps; P1 fills in the real Mux processing, P6 the janitor children.

import { Inngest } from 'inngest'
import { ReviewMediaKind, ReviewPipelineStatus, ReviewState } from '@prisma/client'
import { prisma } from '@/lib/db'
import { reviewLog } from './logger'
import { createMuxAsset, deleteMuxAsset, extractReadyMeta, getMuxAsset, MuxError, type MuxAsset } from './mux'
import { presignGetObject, getObjectRange } from './r2'
import { looksLikeMedia } from './upload-helpers'
import { recordActivity, REVIEW_ACTIVITY } from './activity'
// P1.6 janitor reconcile helpers (call-time-only cycle — see upload-service.ts note).
import { expireInflightUpload, reconcileStuckUploadedVersion } from './upload-service'
// P5.4 decision side-effects. P3-B: F7 auto-flip + manager notify.
import { syncTaskOnChangesRequested, syncTaskFromReviewEvent, revokeClientExposureOnNewVersion } from './task-sync'
import { REVIEW_STATUS_MAP } from './status-map'
import { audit } from '@/lib/audit-log'
import { createAndBroadcastNotifications } from '@/actions/notification-actions'
// P6.1 notifications. P3-B: manager status-flip notify.
import { notifyReview, reviewPlayerUrl, notifyManagerOfReviewFlip } from './notify'
// P6.2 trash purge.
import { purgeExpiredTrash } from './purge'
// P6.3 activity feed bridge.
import { auditReviewFeed } from './feed-audit'

export const inngest = new Inngest({ id: 'hustlytasker-review' })

/** Event names — single source of truth for senders + functions. */
export const REVIEW_EVENTS = {
    MUX_EVENT_RECEIVED: 'review/mux.event.received',
    JANITOR_REQUESTED: 'review/janitor.requested',
    // Emitted by the complete route after R2 CompleteMultipartUpload for a VIDEO:
    // the heavy Mux create-asset call runs in the Inngest handler (P1.4), keeping
    // the request well under Vercel's function timeout.
    UPLOAD_COMPLETED: 'review/upload.completed',
    // P5.4: guest Approve / Request changes was committed to the DB by the
    // decision route; this event fans out the task-side effects (API-SPEC §6.4).
    DECISION_RECORDED: 'review/decision.recorded',
} as const

// Janitor sweep bounds (P1.6). The grace windows keep the nightly reconcile OFF rows that a
// healthy path is still legitimately finalizing/processing; the batch cap bounds one run (a
// hit cap is logged, and the next night drains the rest).
const JANITOR_BATCH = 100
const PURGE_BATCH = 25 // external deletes (Mux+R2) per version → smaller batch than the DB-only sweeps
const UPLOADED_GRACE_MS = 15 * 60 * 1000 // a real R2 finalize lands in seconds
const PROCESSING_GRACE_MS = 20 * 60 * 1000 // Mux "basic" ready is usually < a few minutes
const PROCESSING_HARD_LIMIT_MS = 24 * 60 * 60 * 1000 // still PROCESSING with no Mux asset after 24h ⇒ give up
const WEBHOOK_GRACE_MS = 60 * 60 * 1000 // an un-consumed ledger row is overdue after 1h
const WEBHOOK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // stop re-enqueuing a row nobody can consume after 7d

/**
 * Apply a READY Mux asset to a version: the atomic PROCESSING→READY flip + stack-head + the
 * version.ready activity, all in ONE tx. Idempotent — a redelivered/reconciled event finds it
 * already READY (flip count 0) and writes nothing. Shared by the webhook consumer AND the
 * nightly reconcile so the transition can NEVER drift between the two paths. Returns:
 *   'applied'    — this call performed the transition
 *   'noop'       — already READY (a real duplicate)
 *   'unexpected' — flip missed but the version is NOT ready (early webhook / pre-ready state)
 *   'gone'       — the version no longer exists (purged) → caller consumes the event
 */
async function applyMuxReady(
    versionId: string,
    asset: MuxAsset,
): Promise<'applied' | 'noop' | 'unexpected' | 'gone'> {
    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId },
        include: { asset: { select: { taskId: true } } },
    })
    if (!version) return 'gone'
    const meta = extractReadyMeta(asset)
    const applied = await prisma.$transaction(async (tx) => {
        const flip = await tx.reviewVersion.updateMany({
            where: { id: versionId, pipelineStatus: ReviewPipelineStatus.PROCESSING },
            data: {
                pipelineStatus: ReviewPipelineStatus.READY,
                reviewState: ReviewState.AWAITING_REVIEW,
                readyAt: new Date(),
                muxAssetId: asset.id ?? version.muxAssetId,
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
        if (flip.count === 0) return false
        // The newest ready version becomes the stack head. When it does, CLEAR a stale
        // guest-approval on the asset card (FR-A04 AC2: "upload v2 → không giữ trạng thái
        // đã duyệt của v1"). P5's guest Approve sets asset.statusId='Hoàn tất'; without
        // this a new head would leave that banner live and let staff complete the task
        // against an unreviewed cut. Only clear the approved value — never clobber other
        // staff-set statuses.
        await tx.reviewAsset.updateMany({
            where: { id: version.assetId, statusId: REVIEW_STATUS_MAP.approved },
            data: { statusId: null, rowVersion: { increment: 1 } },
        })
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
        return true
    })
    if (applied) {
        // FR-G02: tell the uploader their cut is ready to review (deep-link to the player).
        void notifyReview({
            recipientIds: [version.uploaderId],
            type: 'VIDEO_VERSION_UPLOADED',
            title: `Bản v${version.versionNumber} đã sẵn sàng để review`,
            body: 'Video đã xử lý xong — mở review để xem và lấy link cho khách.',
            taskId: version.asset.taskId,
            deepLinkUrl: reviewPlayerUrl({ workspaceId: version.workspaceId, assetId: version.assetId, versionId }),
        })
        // FR-G01: "{editor} đã tải bản vN lên" into the task feed + admin log.
        void auditReviewFeed({
            action: 'video.version_ready',
            workspaceId: version.workspaceId,
            taskId: version.asset.taskId,
            assetId: version.assetId,
            actorUserId: version.uploaderId,
            meta: { versionNumber: version.versionNumber },
        })
        // [P3-B / FR-07] Auto-flip the task → "Đã nộp video (nội bộ)" (A2) + email the manager.
        // Direct write (Inngest has no session), predecessor-guarded so a late webhook can't drag
        // an already-approved task back a step. Idempotent by construction: this whole applied-true
        // branch runs at most once per version becoming ready (the atomic PROCESSING→READY flip),
        // so the manager is emailed exactly once — no double-notify on webhook re-delivery / reconcile.
        // Best-effort: the version is already READY; a task-flip failure must NOT fail the pipeline.
        if (version.asset.taskId) {
            // [P4/R5 — BLOCKER] Close the client-exposure leak BEFORE anything else: this new version
            // is now the stack HEAD, and the /r/ share serves HEAD. If the task was already sent to the
            // client, revoke the active shares + clear the client signal so this un-re-approved cut is
            // invisible until the admin re-Duyệt. Self-guarding (no-op unless clientReview='AWAITING'),
            // never throws — an internal-round or first-cut ready is untouched.
            await revokeClientExposureOnNewVersion(version.asset.taskId, version.assetId, version.workspaceId)
            try {
                const flip = await syncTaskFromReviewEvent(
                    version.asset.taskId,
                    version.workspaceId,
                    REVIEW_STATUS_MAP.submitted,
                )
                if (flip.applied) {
                    void notifyManagerOfReviewFlip({
                        taskId: version.asset.taskId,
                        workspaceId: version.workspaceId,
                        assetId: version.assetId,
                        fromStatus: flip.from ?? '',
                        toStatus: flip.to ?? REVIEW_STATUS_MAP.submitted,
                        actorId: null, // system
                        versionId,
                        // uploader already gets the VIDEO_VERSION_UPLOADED in-app confirm above.
                        alsoExcludeIds: [version.uploaderId],
                    })
                }
            } catch (e) {
                reviewLog('error', 'inngest.mux_ready.task_flip_failed', {
                    versionId,
                    taskId: version.asset.taskId,
                    error: String(e),
                })
            }
        }
        return 'applied'
    }
    // flip missed → classify the current state:
    //   READY  = a true duplicate → 'noop' (consume the event, write nothing).
    //   FAILED = TERMINAL (an errored webhook / reconcile won first). A late 'ready' can't un-fail
    //            it (FAILED never transitions back), so it must be CONSUMED, not retried — else the
    //            event is un-consumable and the nightly re-enqueue sweep loops on it forever.
    //   gone   = version purged → nothing to apply → 'noop' (consume).
    //   otherwise (UPLOADED/UPLOADING/PROCESSING) = a genuinely TRANSIENT pre-ready state (early
    //            webhook / crash) that will soon advance → 'unexpected' so the caller retries.
    const cur = await prisma.reviewVersion.findUnique({ where: { id: versionId }, select: { pipelineStatus: true } })
    if (!cur || cur.pipelineStatus === ReviewPipelineStatus.READY || cur.pipelineStatus === ReviewPipelineStatus.FAILED) {
        return 'noop'
    }
    return 'unexpected'
}

/**
 * Apply an ERRORED outcome to a version: atomic {PROCESSING|UPLOADED}→FAILED + version.error
 * activity. Idempotent. Shared by the webhook consumer + the reconcile (Mux GET status errored
 * / 404). Returns 'applied' | 'noop' (already terminal) | 'gone' (version purged).
 */
async function applyMuxErrored(versionId: string, msg: string): Promise<'applied' | 'noop' | 'gone'> {
    const version = await prisma.reviewVersion.findFirst({
        where: { id: versionId },
        include: { asset: { select: { taskId: true } } },
    })
    if (!version) return 'gone'
    return prisma.$transaction(async (tx) => {
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
        // FR-G02: tell the uploader their cut failed to process so they can re-upload.
        void notifyReview({
            recipientIds: [version.uploaderId],
            type: 'VIDEO_VERSION_UPLOADED',
            title: `Bản v${version.versionNumber} xử lý thất bại`,
            body: `Không xử lý được video: ${msg}. Vui lòng tải lại.`,
            taskId: version.asset.taskId,
            deepLinkUrl: reviewPlayerUrl({ workspaceId: version.workspaceId, assetId: version.assetId, versionId }),
        })
        return 'applied'
    })
}

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
                if (isReady) {
                    const outcome = await applyMuxReady(versionId, ledger.asset as MuxAsset)
                    if (outcome === 'gone') {
                        reviewLog('warn', 'inngest.mux_webhook.version_missing', { webhookEventId, versionId })
                        return { orphan: true }
                    }
                    // Unexpected pre-ready state (early webhook / crash): DON'T let mark-processed
                    // swallow the event — throw so Inngest retries, and the nightly reconcile backstops.
                    if (outcome === 'unexpected') {
                        throw new Error(`ready webhook for version ${versionId} not in PROCESSING — retry`)
                    }
                    reviewLog('info', `inngest.mux_webhook.ready_${outcome}`, { versionId })
                    return { applied: outcome === 'applied' ? 'ready' : 'noop' }
                }
                // errored
                const msg = (ledger.asset as MuxAsset).errors?.messages?.join('; ') || 'Mux xử lý video thất bại.'
                const outcome = await applyMuxErrored(versionId, msg)
                if (outcome === 'gone') {
                    reviewLog('warn', 'inngest.mux_webhook.version_missing', { webhookEventId, versionId })
                    return { orphan: true }
                }
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
                    // count 0 = the (PROCESSING & muxAssetId=null) guard missed. Two causes:
                    //   (i) a concurrent run stored a DIFFERENT asset → ours is the orphan → delete it.
                    //   (ii) a fast ready-webhook already set muxAssetId to OUR asset + flipped READY
                    //        (reachable when this run RETRIES after create-mux-asset memoized) → our
                    //        asset is LIVE, must NOT delete it. Re-read to tell them apart.
                    const cur = await prisma.reviewVersion.findUnique({ where: { id: versionId }, select: { muxAssetId: true } })
                    if (cur?.muxAssetId !== created.assetId) {
                        reviewLog('warn', 'inngest.process_upload.duplicate_asset', { versionId, muxAssetId: created.assetId })
                        await deleteMuxAsset(created.assetId).catch(() => {})
                    }
                }
                return res.count
            })
        }
        reviewLog('info', 'inngest.process_upload.created', { versionId, muxAssetId: created.assetId, mine: created.mine })
        return { muxAssetId: created.assetId }
    },
)

/**
 * One stuck-PROCESSING video (P1.6): the Mux webhook was missed (or the create-asset job never
 * landed). Consult Mux directly and apply the SAME transition the webhook would have, or re-fire
 * the create-asset job. Idempotent — races the real webhook safely (both do the atomic flip).
 */
async function reconcileProcessingVersion(versionId: string, muxAssetId: string | null, stale: boolean): Promise<string> {
    if (!muxAssetId) {
        if (stale) {
            // The create-mux-asset job has failed to land for >24h — stop re-firing nightly; fail it
            // so the card shows a retryable error instead of spinning "processing" forever.
            await applyMuxErrored(versionId, 'Không thể khởi tạo xử lý video (quá thời gian).')
            return 'create-timeout-failed'
        }
        // The create-mux-asset job (reviewProcessUpload) never landed → re-fire it (idempotent:
        // it re-checks muxAssetId + PROCESSING and no-ops if a concurrent run already made one).
        await inngest.send({ name: REVIEW_EVENTS.UPLOAD_COMPLETED, data: { versionId } })
        return 're-enqueued-create'
    }
    let asset: MuxAsset
    try {
        asset = await getMuxAsset(muxAssetId)
    } catch (e) {
        if (e instanceof MuxError && e.status === 404) {
            // Mux lost/deleted the asset → fail so the card shows a retryable error.
            await applyMuxErrored(versionId, 'Mux không còn asset cho bản dựng này.')
            return 'mux-404-failed'
        }
        reviewLog('warn', 'inngest.janitor.mux_get_failed', { versionId, muxAssetId, error: String(e) })
        return 'mux-get-error'
    }
    if (asset.status === 'ready') return `ready-${await applyMuxReady(versionId, asset)}`
    if (asset.status === 'errored') {
        const msg = asset.errors?.messages?.join('; ') || 'Mux xử lý video thất bại.'
        return `errored-${await applyMuxErrored(versionId, msg)}`
    }
    // Still 'preparing'. Normally we leave it (Mux will emit ready/errored). But a Mux-side ingest
    // stall can leave an asset in 'preparing' forever with no terminal webhook — so past the 24h
    // hard limit, give up per spec (UPLOAD-PIPELINE §24h): fail the version + delete the stuck
    // (billable) Mux asset, so the card shows a retryable error instead of spinning indefinitely.
    if (stale) {
        const outcome = await applyMuxErrored(versionId, 'Xử lý video quá thời gian (Mux treo ở "preparing").')
        // Reap the stuck (billable) Mux asset — but ONLY once the version is terminally FAILED with
        // this exact asset still attached. The getMuxAsset 'preparing' read is a snapshot that may be
        // stale: a real ready webhook could have flipped PROCESSING→READY concurrently (applyMuxErrored
        // then returns 'noop'), and deleting would kill a LIVE playback. Re-confirming FAILED avoids
        // that AND self-heals a prior run that flipped FAILED but crashed before deleting (also 'noop').
        if (outcome === 'applied' || outcome === 'noop') {
            const cur = await prisma.reviewVersion.findUnique({
                where: { id: versionId },
                select: { pipelineStatus: true, muxAssetId: true },
            })
            if (cur?.pipelineStatus === ReviewPipelineStatus.FAILED && cur.muxAssetId === muxAssetId) {
                await deleteMuxAsset(muxAssetId).catch(() => {})
            }
        }
        return `preparing-timeout-${outcome}`
    }
    return 'still-preparing'
}

/**
 * P1.6: nightly reconcile (KIEN-TRUC §6.2). Four idempotent, status-guarded sweeps that repair
 * every residual the happy path can strand (crashed browser mid-upload, dropped Mux webhook,
 * un-consumed ledger row). Each is its own step so a mid-run failure retries ONLY that sweep;
 * every write re-checks state, so a re-run is a no-op. Batch caps bound one run (a hit cap is
 * logged — "no silent truncation" — and the next night drains the rest). `inngest.send` inside a
 * step is fine here: the consumers are keyed idempotent, so a re-send on step retry is absorbed.
 */
export const reviewJanitor = inngest.createFunction(
    { id: 'review-janitor', retries: 2, triggers: [{ event: REVIEW_EVENTS.JANITOR_REQUESTED }] },
    async ({ step }) => {
        // (a) Dead in-flight uploads: version still UPLOADING past its 24h window.
        const aborted = await step.run('abort-expired-uploading', async () => {
            const sessions = await prisma.uploadSession.findMany({
                where: {
                    completedAt: null,
                    abortedAt: null,
                    expiresAt: { lt: new Date() },
                    version: { is: { pipelineStatus: ReviewPipelineStatus.UPLOADING } },
                },
                select: { id: true },
                take: JANITOR_BATCH,
            })
            let expired = 0
            for (const s of sessions) {
                try {
                    if ((await expireInflightUpload(s.id)) === 'expired') expired++
                } catch (e) {
                    reviewLog('error', 'inngest.janitor.abort_failed', { sessionId: s.id, error: String(e) })
                }
            }
            if (sessions.length === JANITOR_BATCH) reviewLog('warn', 'inngest.janitor.abort_cap_hit', { batch: JANITOR_BATCH })
            return { scanned: sessions.length, expired }
        })

        // (b) Stuck-UPLOADED crash window: finalize claimed but the transition never ran.
        const redriven = await step.run('redrive-stuck-uploaded', async () => {
            const cutoff = new Date(Date.now() - UPLOADED_GRACE_MS)
            const versions = await prisma.reviewVersion.findMany({
                where: { pipelineStatus: ReviewPipelineStatus.UPLOADED, deletedAt: null, updatedAt: { lt: cutoff } },
                select: { id: true },
                take: JANITOR_BATCH,
            })
            const tally = { scanned: versions.length, driven: 0, failed: 0, waiting: 0 }
            for (const v of versions) {
                try {
                    const r = await reconcileStuckUploadedVersion(v.id)
                    if (r === 'driven') tally.driven++
                    else if (r === 'failed') tally.failed++
                    else if (r === 'waiting') tally.waiting++
                } catch (e) {
                    reviewLog('error', 'inngest.janitor.redrive_failed', { versionId: v.id, error: String(e) })
                }
            }
            if (versions.length === JANITOR_BATCH) reviewLog('warn', 'inngest.janitor.redrive_cap_hit', { batch: JANITOR_BATCH })
            return tally
        })

        // (c) Stuck-PROCESSING videos: a Mux webhook was missed (or create-asset never landed).
        const reconciled = await step.run('reconcile-processing', async () => {
            const cutoff = new Date(Date.now() - PROCESSING_GRACE_MS)
            const versions = await prisma.reviewVersion.findMany({
                where: {
                    pipelineStatus: ReviewPipelineStatus.PROCESSING,
                    mediaKind: ReviewMediaKind.VIDEO,
                    deletedAt: null,
                    updatedAt: { lt: cutoff },
                },
                select: { id: true, muxAssetId: true, updatedAt: true },
                take: JANITOR_BATCH,
            })
            const hardCutoff = Date.now() - PROCESSING_HARD_LIMIT_MS
            const tally: Record<string, number> = { scanned: versions.length }
            for (const v of versions) {
                try {
                    const r = await reconcileProcessingVersion(v.id, v.muxAssetId, v.updatedAt.getTime() < hardCutoff)
                    tally[r] = (tally[r] ?? 0) + 1
                } catch (e) {
                    reviewLog('error', 'inngest.janitor.reconcile_failed', { versionId: v.id, error: String(e) })
                }
            }
            if (versions.length === JANITOR_BATCH) reviewLog('warn', 'inngest.janitor.reconcile_cap_hit', { batch: JANITOR_BATCH })
            return tally
        })

        // (d) Un-consumed webhook ledger rows (1h..7d old): re-enqueue the consumer. The 7d floor
        // stops re-driving a row nobody can ever consume (defence-in-depth — the consumer already
        // consumes terminal/orphan events, so these should be rare); such rows are counted + logged.
        const reEnqueued = await step.run('reenqueue-webhooks', async () => {
            const now = Date.now()
            const rows = await prisma.webhookEvent.findMany({
                where: {
                    processedAt: null,
                    receivedAt: { gte: new Date(now - WEBHOOK_MAX_AGE_MS), lt: new Date(now - WEBHOOK_GRACE_MS) },
                },
                select: { id: true },
                take: JANITOR_BATCH,
            })
            for (const w of rows) {
                await inngest
                    .send({ name: REVIEW_EVENTS.MUX_EVENT_RECEIVED, data: { webhookEventId: w.id } })
                    .catch((e) => reviewLog('error', 'inngest.janitor.reenqueue_failed', { webhookEventId: w.id, error: String(e) }))
            }
            if (rows.length === JANITOR_BATCH) reviewLog('warn', 'inngest.janitor.reenqueue_cap_hit', { batch: JANITOR_BATCH })
            const abandoned = await prisma.webhookEvent.count({
                where: { processedAt: null, receivedAt: { lt: new Date(now - WEBHOOK_MAX_AGE_MS) } },
            })
            if (abandoned > 0) reviewLog('warn', 'inngest.janitor.webhooks_abandoned', { abandoned })
            return { reEnqueued: rows.length, abandoned }
        })

        // (e) P6.2: purge trash past 30 days — physically delete Mux assets + R2 objects
        // + DB rows (ref-counted so a live copy's shared object is never removed). Its own
        // step → a purge failure retries only this sweep, and it rides the SAME nightly
        // trigger (no new Inngest function → no extra sync step; see GOTCHA in memory).
        const purged = await step.run('purge-expired-trash', () => purgeExpiredTrash(PURGE_BATCH))

        reviewLog('info', 'inngest.janitor.done', { aborted, redriven, reconciled, reEnqueued, purged })
        return { ok: true, aborted, redriven, reconciled, reEnqueued, purged }
    },
)

// ────────────────── P5.4: guest decision → task sync (API-SPEC §6.4) ──────────────────
// The decision itself is ALREADY committed by the decision route (source of
// truth in the DB); this function only fans out side-effects. Each step retries
// independently. "Latest wins": if the version's reviewState no longer matches
// the event's decision (the guest flipped again / a new version reset the state),
// the side-effects are skipped instead of applying a stale decision.
interface DecisionEventData {
    versionId: string
    assetId: string
    taskId: string | null
    workspaceId: string
    shareLinkId: string
    decision: 'approve' | 'request_changes'
    guestName: string | null
    versionNumber: number
}

export const reviewShareDecision = inngest.createFunction(
    { id: 'review-share-decision', retries: 4, triggers: [{ event: REVIEW_EVENTS.DECISION_RECORDED }] },
    async ({ event, step }) => {
        const data = event.data as unknown as DecisionEventData
        const expected = data.decision === 'approve' ? ReviewState.APPROVED : ReviewState.CHANGES_REQUESTED

        const loaded = await step.run('load-state', async () => {
            const v = await prisma.reviewVersion.findUnique({
                where: { id: data.versionId },
                select: { reviewState: true, asset: { select: { currentVersionId: true } } },
            })
            return { reviewState: v?.reviewState ?? null, isHead: v?.asset?.currentVersionId === data.versionId }
        })
        // "Latest wins": skip when the version's decision was overwritten, OR when a newer
        // version has since become the head (an old-version decision has no task meaning).
        // This is the second guard against a delayed/duplicate retry force-flipping a task
        // hours later after staff moved on (the reviewState-only check can't see a new head
        // because a decided version keeps its own reviewState).
        if (loaded.reviewState !== expected || !loaded.isHead) {
            reviewLog('info', 'share_decision.superseded', {
                versionId: data.versionId,
                decision: data.decision,
                currentState: loaded.reviewState,
                isHead: loaded.isHead,
            })
            return { skipped: 'superseded' }
        }

        if (!data.taskId) return { ok: true, task: 'none' } // Team-only asset — nothing to sync

        // FR-A05: request_changes AUTO-flips the task; approve only proposes (banner
        // comes from asset.statusId = "Hoàn tất", set by the decision route).
        let syncApplied = true
        // [P3-B] The guest-change sync now retargets A5 → A6 ('Đã nhận feedback (khách)') when the
        // task was already sent to the client, else keeps legacy 'Revision'. Capture the ACTUAL
        // written status so the staff notification below states the real target, not an assumed one.
        let syncTarget: string | undefined
        if (data.decision === 'request_changes') {
            const res = await step.run('sync-task-revision', () =>
                syncTaskOnChangesRequested(data.taskId!, data.workspaceId),
            )
            syncApplied = !!res?.applied
            syncTarget = res?.to
        }

        // Task feed event — the drawer's "Bình luận & hoạt động" merges AuditLog rows;
        // these two actions already exist app-wide with the exact VN labels
        // ("khách đã duyệt" / "khách yêu cầu chỉnh sửa"). actor=null renders "Khách hàng".
        await step.run('task-feed-audit', () =>
            audit({
                workspaceId: data.workspaceId,
                actorUserId: null,
                action: data.decision === 'approve' ? 'task.client_approved' : 'task.client_changes_requested',
                targetType: 'Task',
                targetId: data.taskId,
                after: {
                    guestName: data.guestName,
                    versionNumber: data.versionNumber,
                    via: 'review-share',
                    shareLinkId: data.shareLinkId,
                },
            }),
        )

        await step.run('notify-staff', async () => {
            const task = await prisma.task.findUnique({
                where: { id: data.taskId! },
                select: { title: true, assigneeId: true, assignedById: true },
            })
            if (!task) return { notified: 0 }
            const userIds = Array.from(
                new Set([task.assigneeId, task.assignedById].filter((x): x is string => !!x)),
            )
            if (!userIds.length) return { notified: 0 }
            const who = data.guestName ?? 'Khách'
            const rows = await createAndBroadcastNotifications(
                userIds,
                data.decision === 'approve'
                    ? {
                          type: 'VIDEO_REVIEW_APPROVED',
                          title: `✅ ${who} đã duyệt bản v${data.versionNumber}`,
                          body: `Task "${task.title}" — mở chi tiết task để xác nhận chuyển Hoàn tất.`,
                          taskId: data.taskId,
                      }
                    : {
                          type: 'VIDEO_CHANGES_REQUESTED',
                          title: `✏️ ${who} yêu cầu chỉnh sửa bản v${data.versionNumber}`,
                          // Only claim the task auto-flipped when it actually did — a
                          // race-lost / archived / bad-map sync returns applied:false and
                          // the task kept its status; a false "đã chuyển …" would mislead
                          // staff (finding P5-R#16). State the REAL target (A6 or Revision).
                          body: syncApplied
                              ? `Task "${task.title}" đã tự chuyển sang "${syncTarget ?? REVIEW_STATUS_MAP.changesRequested}".`
                              : `Task "${task.title}" — khách yêu cầu chỉnh sửa, kiểm tra trạng thái task.`,
                          taskId: data.taskId,
                      },
            )
            return { notified: rows.length }
        })

        return { ok: true }
    },
)

export const reviewFunctions = [reviewMuxWebhook, reviewProcessUpload, reviewJanitor, reviewShareDecision]
