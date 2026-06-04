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
    // [Chat] pin/unpin a message + a new thread reply (so open thread panels update live).
    PIN: 'pin',
    THREAD_REPLY: 'thread_reply',
    // [Phase 2] ephemeral call signals + typing indicator (no DB; LiveKit /active
    // is the source of truth for the call banner — these just make it feel instant).
    CALL_STARTED: 'call_started',
    CALL_ENDED: 'call_ended',
    TYPING: 'typing',
} as const

export type ChatEvent = (typeof CHAT_EVENTS)[keyof typeof CHAT_EVENTS]

/** Supabase broadcast topic for a channel's live message stream. */
export function getChannelBroadcastTopic(channelId: string) {
    return `channel:${channelId}`
}

/** Supabase broadcast topic for a single thread's live replies (keyed by parent message id). */
export function getThreadBroadcastTopic(parentId: string) {
    return `thread:${parentId}`
}
