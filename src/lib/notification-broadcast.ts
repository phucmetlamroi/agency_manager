// Server-side helper to broadcast NOTIFICATION_NEW events to a user's
// private channel via Supabase Realtime REST endpoint.
// This is a fire-and-forget broadcast — if it fails, the user will still see
// the notification next time they poll or open the panel.

import { CHAT_EVENTS, getUserNotificationChannel } from './chat-channels'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export async function broadcastNotificationToUser(userId: string, payload: any) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return

    const channelName = getUserNotificationChannel(userId)
    const url = `${SUPABASE_URL}/realtime/v1/api/broadcast`

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({
                messages: [{
                    topic: channelName,
                    event: CHAT_EVENTS.NOTIFICATION_NEW,
                    payload,
                }],
            }),
        })
    } catch {
        // Best-effort — notification persists in DB regardless
    }
}
