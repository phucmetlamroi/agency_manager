'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { playNotificationSound, flashTabTitle, initNotificationSound } from '@/lib/notification-sound'
import { getUnreadCounts, getConversations } from '@/actions/chat-actions'
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
    mutedConversationIds: Set<string>
    setConversationMutedLocal: (conversationId: string, muted: boolean) => void
    refreshMutedConversations: () => void
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
    const [mutedConversationIds, setMutedConversationIds] = useState<Set<string>>(new Set())
    const mutedConversationIdsRef = useRef<Set<string>>(new Set())
    const onIncomingRef = useRef<((msg: ChatMessage) => void) | null>(null)
    mutedConversationIdsRef.current = mutedConversationIds

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

    const refreshMutedConversations = useCallback(async () => {
        const res = await getConversations()
        if (res.data) {
            const muted = new Set<string>()
            res.data.forEach((c: any) => {
                if (c.isMuted) muted.add(c.id)
            })
            setMutedConversationIds(muted)
        }
    }, [])

    const setConversationMutedLocal = useCallback((conversationId: string, muted: boolean) => {
        setMutedConversationIds(prev => {
            const next = new Set(prev)
            if (muted) next.add(conversationId)
            else next.delete(conversationId)
            return next
        })
    }, [])

    // Initialize audio unlock on first user interaction (fixes browser autoplay policy)
    useEffect(() => {
        initNotificationSound()
    }, [])

    useEffect(() => {
        refreshUnread()
        refreshMutedConversations()
        const interval = setInterval(() => {
            refreshUnread()
            refreshMutedConversations()
        }, 10000)
        return () => clearInterval(interval)
    }, [refreshUnread, refreshMutedConversations])

    const handleNotification = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.NEW_MESSAGE && payload.senderId !== userId) {
            if (payload.conversationId !== activeConversationId) {
                const isMuted = mutedConversationIdsRef.current.has(payload.conversationId)
                // Mention OR important message overrides mute
                const isMention = Array.isArray(payload.message?.mentions) && payload.message.mentions.includes(userId)
                const isImportant = !!payload.message?.isImportant
                const isAnnouncement = payload.message?.type === 'ANNOUNCEMENT'
                if (!isMuted || isMention || isImportant || isAnnouncement) {
                    playNotificationSound()
                    const prefix = isMention ? '@you ' : isImportant ? '⭐ ' : isAnnouncement ? '📣 ' : ''
                    flashTabTitle(`${prefix}${payload.senderName || 'Someone'}`)
                }
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
        if (event === CHAT_EVENTS.CONVERSATION_DELETED && payload.hardDelete) {
            // Group nuked by creator — refresh local state
            refreshMutedConversations()
        }
    }, [userId, activeConversationId, refreshMutedConversations])

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
                mutedConversationIds,
                setConversationMutedLocal,
                refreshMutedConversations,
            }}
        >
            {children}
        </ChatContext.Provider>
    )
}
