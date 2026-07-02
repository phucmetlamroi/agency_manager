// Server-side helper to broadcast NOTIFICATION_NEW events to a user's
// private channel via Supabase Realtime REST endpoint.
// This is a fire-and-forget broadcast — if it fails, the user will still see
// the notification next time they poll or open the panel.

import { NOTIFICATION_EVENTS, getUserNotificationChannel } from './notification-channels'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * [Chat GĐ3 · E1] Generic fire-and-forget broadcast to ANY topic — the
 * building block generalised from `broadcastNotificationToUser`. Used by the
 * task-comment feed (`task:{taskId}`). Best-effort with a hard 3s timeout; if
 * it fails, subscribers still catch up via their next fetch / poll. Keep
 * payloads MINIMAL and non-sensitive — clients re-fetch the authoritative,
 * role-filtered feed rather than trusting the pushed payload.
 */
export async function broadcastToTopic(topic: string, event: string, payload: any) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const url = `${SUPABASE_URL}/realtime/v1/api/broadcast`
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3_000)
    try {
        const res = await fetch(url, {
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
            console.warn('[broadcast] topic failed', topic, res.status, await res.text().catch(() => ''))
        }
    } catch (e) {
        console.warn('[broadcast] topic network error', topic, e)
    } finally {
        clearTimeout(t)
    }
}

export async function broadcastNotificationToUser(userId: string, payload: any) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const channelName = getUserNotificationChannel(userId)
    const url = `${SUPABASE_URL}/realtime/v1/api/broadcast`

    // [Reliability] Hard 3s timeout — best-effort broadcast.
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3_000)
    try {
        const res = await fetch(url, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
                messages: [{
                    topic: channelName,
                    event: NOTIFICATION_EVENTS.NOTIFICATION_NEW,
                    payload,
                }],
            }),
        })
        // fetch KHÔNG throw khi 4xx/5xx → phải tự kiểm. Thiếu SERVICE_ROLE_KEY
        // (broadcast bằng anon) thường trả 401/403 → log để ops thấy (trước đây ẩn).
        if (!res.ok) {
            console.warn('[broadcast] notification failed', res.status, await res.text().catch(() => ''))
        }
    } catch (e) {
        // Best-effort — notification persists in DB regardless
        console.warn('[broadcast] notification network error', e)
    } finally {
        clearTimeout(t)
    }
}

