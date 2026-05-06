'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { playNotificationSound, flashTabTitle, initNotificationSound } from '@/lib/notification-sound'
import { getUnreadCounts } from '@/actions/chat-actions'
import type { ChatMessage } from '@/hooks/useChatMessages'

interface ChatContextValue {
    currentUserId: string
    activeConversationId: string | null
    setActiveConversationId: (id: string | null) => void
    unreadTotal: number
    unreadCounts: Record<string, number>
    refreshUnread: () => void
    isPanelOpen: boolean
    setIsPanelOpen: (open: boolean) => void
    onIncomingMessage: ((msg: ChatMessage) => void) | null
    setOnIncomingMessage: (handler: ((msg: ChatMessage) => void) | null) => void
    openConversation: (conversationId: string, name?: string) => void
    pendingConversationId: string | null
    pendingConversationName: string | null
    clearPendingConversation: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useChatContext() {
    const ctx = useContext(ChatContext)
    if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
    return ctx
}

export function ChatProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
    const [unreadTotal, setUnreadTotal] = useState(0)
    const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({})
    const [isPanelOpen, setIsPanelOpen] = useState(false)
    const [pendingConversationId, setPendingConversationId] = useState<string | null>(null)
    const [pendingConversationName, setPendingConversationName] = useState<string | null>(null)
    const onIncomingRef = useRef<((msg: ChatMessage) => void) | null>(null)

    const openConversation = useCallback((conversationId: string, name?: string) => {
        setPendingConversationId(conversationId)
        setPendingConversationName(name || null)
        setIsPanelOpen(true)
    }, [])

    const clearPendingConversation = useCallback(() => {
        setPendingConversationId(null)
        setPendingConversationName(null)
    }, [])

    const refreshUnread = useCallback(async () => {
        const result = await getUnreadCounts()
        if (result.data && 'counts' in result.data) {
            setUnreadCounts(result.data.counts as Record<string, number>)
            setUnreadTotal(result.data.total as number)
        }
    }, [])

    // Initialize audio unlock on first user interaction (fixes browser autoplay policy)
    useEffect(() => {
        initNotificationSound()
    }, [])

    useEffect(() => {
        refreshUnread()
        const interval = setInterval(refreshUnread, 10000)
        return () => clearInterval(interval)
    }, [refreshUnread])

    const handleNotification = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.NEW_MESSAGE && payload.senderId !== userId) {
            if (payload.conversationId !== activeConversationId) {
                playNotificationSound()
                flashTabTitle(payload.senderName || 'Someone')
                setUnreadCounts(prev => ({
                    ...prev,
                    [payload.conversationId]: (prev[payload.conversationId] || 0) + 1,
                }))
                setUnreadTotal(prev => prev + 1)
            }

            if (onIncomingRef.current) {
                onIncomingRef.current(payload.message)
            }
        }
    }, [userId, activeConversationId])

    useSupabaseChannel(getUserNotificationChannel(userId), handleNotification, true)

    const setOnIncomingMessage = useCallback((handler: ((msg: ChatMessage) => void) | null) => {
        onIncomingRef.current = handler
    }, [])

    return (
        <ChatContext.Provider
            value={{
                currentUserId: userId,
                activeConversationId,
                setActiveConversationId,
                unreadTotal,
                unreadCounts,
                refreshUnread,
                isPanelOpen,
                setIsPanelOpen,
                onIncomingMessage: onIncomingRef.current,
                setOnIncomingMessage,
                openConversation,
                pendingConversationId,
                pendingConversationName,
                clearPendingConversation,
            }}
        >
            {children}
        </ChatContext.Provider>
    )
}
