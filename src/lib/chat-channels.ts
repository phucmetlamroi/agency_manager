export const CHAT_EVENTS = {
    NEW_MESSAGE: 'new_message',
    MESSAGE_UPDATED: 'message_updated',
    MESSAGE_EDITED: 'message_edited',
    MESSAGE_DELETED: 'message_deleted',
    VIEW_ONCE_VIEWED: 'view_once_viewed',
    CONVERSATION_DELETED: 'conversation_deleted',
    TYPING: 'typing',
    READ_RECEIPT: 'read_receipt',
    REACTION: 'reaction',
    CONVERSATION_UPDATED: 'conversation_updated',
} as const

export function getConversationChannel(conversationId: string) {
    return `chat:${conversationId}`
}

export function getUserNotificationChannel(userId: string) {
    return `user:${userId}`
}

export type ChatEventPayload = {
    type: typeof CHAT_EVENTS[keyof typeof CHAT_EVENTS]
    conversationId: string
    senderId: string
    senderName: string
    data: any
}
