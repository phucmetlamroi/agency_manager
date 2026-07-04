// [Review module] Inngest client + P0 function skeletons (KIEN-TRUC §6.1).
// P0 proves the pipeline end-to-end (webhook → event → function run) with
// log-only steps; P1 fills in the real Mux processing, P6 the janitor children.

import { Inngest } from 'inngest'
import { prisma } from '@/lib/db'
import { reviewLog } from './logger'

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
 * P0 skeleton: claim the WebhookEvent row (idempotent — conditional update on
 * processedAt IS NULL) and log. P1 replaces the log step with: GET asset from
 * Mux → update ReviewVersion (ready/failed + metadata) → reviewState
 * AWAITING_REVIEW → activity "đã tải bản Vn lên".
 */
export const reviewMuxWebhook = inngest.createFunction(
    // Inngest v4 API: triggers live inside the config object (2-arg form).
    { id: 'review-mux-webhook', triggers: [{ event: REVIEW_EVENTS.MUX_EVENT_RECEIVED }] },
    async ({ event, step }) => {
        const webhookEventId = event.data?.webhookEventId as string | undefined
        if (!webhookEventId) {
            reviewLog('warn', 'inngest.mux_webhook.missing_id', {})
            return { skipped: true }
        }
        const claimed = await step.run('claim-webhook-event', async () => {
            // Conditional update = idempotency: only the first run claims it.
            const res = await prisma.webhookEvent.updateMany({
                where: { id: webhookEventId, processedAt: null },
                data: { processedAt: new Date() },
            })
            return res.count === 1
        })
        if (!claimed) {
            reviewLog('info', 'inngest.mux_webhook.duplicate_skip', { webhookEventId })
            return { duplicate: true }
        }
        // P1: real processing goes here (per-step retries).
        reviewLog('info', 'inngest.mux_webhook.claimed', { webhookEventId })
        return { claimed: true }
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

export const reviewFunctions = [reviewMuxWebhook, reviewJanitor]
