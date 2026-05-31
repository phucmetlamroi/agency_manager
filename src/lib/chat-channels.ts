// Realtime chat channel helpers (Supabase Broadcast).
//
// Mirrors notification-channels.ts. Each Hub channel maps to a Supabase
// broadcast topic `channel:{channelId}`. The DB (Neon) is the source of truth;
// these broadcasts are ephemeral "a message happened" hints — clients dedupe by
// the message's DB id and refetch history from Postgres.

export const CHAT_EVENTS = {
    MESSAGE_NEW: 'message_new',
    MESSAGE_EDIT: 'message_edit',
    MESSAGE_DELETE: 'message_delete',
    REACTION: 'reaction',
} as const

export type ChatEvent = (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS]

/** Supabase broadcast topic for a channel's live message stream. */
export function getChannelBroadcastTopic(channelId: string) {
    return `channel:${channelId}`
}
