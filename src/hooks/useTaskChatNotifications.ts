'use client'

import { useState, useEffect, useRef } from 'react'
import { useChatContext } from '@/components/chat/ChatProvider'
import { getTaskConversationStatus, getTaskUnreadCounts } from '@/actions/chat-actions'

type ChatStatus = { hasConversation: boolean; conversationId: string | null }

export function useTaskChatNotifications(taskIds: string[]) {
    const [unreadMap, setUnreadMap] = useState<Record<string, number>>({})
    const [chatStatusMap, setChatStatusMap] = useState<Record<string, ChatStatus>>({})
    const { unreadCounts } = useChatContext()
    const prevTaskIdsRef = useRef<string>('')

    useEffect(() => {
        const key = taskIds.sort().join(',')
        if (key === prevTaskIdsRef.current || taskIds.length === 0) return
        prevTaskIdsRef.current = key

        let cancelled = false
        Promise.all([
            getTaskConversationStatus(taskIds),
            getTaskUnreadCounts(taskIds),
        ]).then(([status, unread]) => {
            if (cancelled) return
            setChatStatusMap(status)
            setUnreadMap(unread)
        })

        return () => { cancelled = true }
    }, [taskIds])

    useEffect(() => {
        const newUnread: Record<string, number> = {}
        for (const [taskId, status] of Object.entries(chatStatusMap)) {
            if (status.conversationId && unreadCounts[status.conversationId]) {
                newUnread[taskId] = unreadCounts[status.conversationId]
            }
        }
        if (Object.keys(newUnread).length > 0) {
            setUnreadMap(prev => ({ ...prev, ...newUnread }))
        }
    }, [unreadCounts, chatStatusMap])

    return { unreadMap, chatStatusMap }
}
