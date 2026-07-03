// [Video Review] Server-side realtime fan-out for the Frame.io-style review
// portal. Mirrors src/lib/notification-broadcast.ts: a fire-and-forget POST to
// Supabase Realtime's REST broadcast endpoint. If it fails, the client still
// catches up on next fetch/reload — realtime is a nicety, not the source of
// truth (the DB is).
//
// Channels are keyed per VERSION so a reviewer watching V2 only receives V2's
// comment/status events, matching Frame.io's per-version comment isolation.

import {
    REVIEW_EVENTS,
    type ReviewEvent,
    getReviewVersionChannel,
    getReviewTaskChannel,
} from './review-channels'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export { REVIEW_EVENTS, getReviewVersionChannel, getReviewTaskChannel }

async function broadcast(topic: string, event: ReviewEvent, payload: unknown) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3_000)
    try {
        const res = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({ messages: [{ topic, event, payload }] }),
        })
        if (!res.ok) {
            console.warn('[review-broadcast] failed', res.status, await res.text().catch(() => ''))
        }
    } catch (e) {
        console.warn('[review-broadcast] network error', e)
    } finally {
        clearTimeout(t)
    }
}

/** Broadcast an event onto a version's review room. */
export function broadcastReviewEvent(versionId: string, event: ReviewEvent, payload: unknown) {
    return broadcast(getReviewVersionChannel(versionId), event, payload)
}

/** Broadcast a "new version available" onto the deliverable's channel. */
export function broadcastVersionLanded(taskId: string, payload: unknown) {
    return broadcast(getReviewTaskChannel(taskId), REVIEW_EVENTS.VERSION_NEW, payload)
}

/**
 * Broadcast any review event onto the deliverable's channel. The staff upload
 * panel subscribes here so version readiness + review status stay live without
 * re-opening the task modal (the per-version channel is client-review-only).
 */
export function broadcastTaskReviewEvent(taskId: string, event: ReviewEvent, payload: unknown) {
    return broadcast(getReviewTaskChannel(taskId), event, payload)
}
