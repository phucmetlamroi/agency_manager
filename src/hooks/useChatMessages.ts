'use client'

import { useState, useCallback, useRef, useTransition } from 'react'
import { getMessages, sendMessage as sendMessageAction } from '@/actions/chat-actions'

export interface ChatMessage {
    id: string
    conversationId: string
    senderId: string
    content: string | null
    type: 'TEXT' | 'IMAGE' | 'FILE' | 'SYSTEM'
    fileUrl: string | null
    fileName: string | null
    fileSize: number | null
    replyToId: string | null
    isEdited: boolean
    isDeleted: boolean
    editedAt?: string | null
    deletedAt?: string | null
    viewOnce?: boolean
    viewed?: boolean
    expired?: boolean
    createdAt: string
    sender: {
        id: string
        username: string
        nickname: string | null
        avatarUrl: string | null
    }
    replyTo?: {
        id: string
        content: string | null
        sender: { username: string; nickname: string | null }
    } | null
    reactions: {
        emoji: string
        count: number
        userIds: string[]
    }[]
}

export function useChatMessages(conversationId: string | null) {
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [hasMore, setHasMore] = useState(true)
    const [isLoading, setIsLoading] = useState(false)
    const [isPending, startTransition] = useTransition()
    const cursorRef = useRef<string | undefined>(undefined)

    const loadMessages = useCallback(async (reset = false) => {
        if (!conversationId) return
        setIsLoading(true)
        try {
            const cursor = reset ? undefined : cursorRef.current
            const result = await getMessages(conversationId, cursor, 30)
            if (result.error) return

            const newMessages = result.data || []
            setMessages(prev => reset ? newMessages : [...prev, ...newMessages])
            setHasMore(newMessages.length === 30)
            if (newMessages.length > 0) {
                cursorRef.current = newMessages[newMessages.length - 1].id
            }
        } finally {
            setIsLoading(false)
        }
    }, [conversationId])

    const sendMessage = useCallback(async (
        content: string,
        type: 'TEXT' | 'IMAGE' | 'FILE' = 'TEXT',
        replyToId?: string,
        fileUrl?: string,
        fileName?: string,
        fileSize?: number,
        viewOnce?: boolean
    ) => {
        if (!conversationId) return null

        const result = await sendMessageAction(conversationId, content, type, replyToId, fileUrl, fileName, fileSize, viewOnce ?? false)
        return result.data || null
    }, [conversationId])

    const addOptimisticMessage = useCallback((message: ChatMessage) => {
        setMessages(prev => [message, ...prev])
    }, [])

    const addIncomingMessage = useCallback((message: ChatMessage) => {
        setMessages(prev => {
            // Skip if this exact message ID already exists
            if (prev.some(m => m.id === message.id)) return prev
            // Remove any matching optimistic temp messages (same sender + same content)
            const filtered = prev.filter(m => {
                if (!m.id.startsWith('temp-')) return true
                if (m.senderId === message.senderId && m.content === message.content) return false
                return true
            })
            return [message, ...filtered]
        })
    }, [])

    const updateMessage = useCallback((messageId: string, updates: Partial<ChatMessage>) => {
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ...updates } : m))
    }, [])

    const reset = useCallback(() => {
        setMessages([])
        setHasMore(true)
        cursorRef.current = undefined
    }, [])

    return {
        messages,
        hasMore,
        isLoading: isLoading || isPending,
        loadMessages,
        sendMessage,
        addOptimisticMessage,
        addIncomingMessage,
        updateMessage,
        reset,
    }
}
