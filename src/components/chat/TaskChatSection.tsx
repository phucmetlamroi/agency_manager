'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { getOrCreateTaskConversation } from '@/actions/chat-actions'
import { ChatWindow } from './ChatWindow'

interface TaskChatSectionProps {
    taskId: string
    workspaceId: string
}

export function TaskChatSection({ taskId, workspaceId }: TaskChatSectionProps) {
    const [conversationId, setConversationId] = useState<string | null>(null)
    const [conversationName, setConversationName] = useState<string>('Task Chat')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const initChat = useCallback(async () => {
        setLoading(true)
        setError(null)
        const res = await getOrCreateTaskConversation(taskId, workspaceId)
        if (res.data) {
            setConversationId(res.data.conversationId)
            if (res.data.conversationName) {
                setConversationName(res.data.conversationName)
            }
        } else if (res.error) {
            setError(res.error)
        }
        setLoading(false)
    }, [taskId, workspaceId])

    useEffect(() => {
        initChat()
    }, [initChat])

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="animate-spin w-5 h-5 text-violet-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="p-4 text-center">
                <p className="text-xs text-zinc-500 mb-2">{error}</p>
                <button
                    onClick={initChat}
                    className="px-4 py-1.5 rounded-lg border-none cursor-pointer bg-violet-500/15 text-violet-500 text-xs font-semibold hover:bg-violet-500/25 transition-colors"
                >
                    Retry
                </button>
            </div>
        )
    }

    if (!conversationId) return null

    return (
        <div className="h-[360px] flex flex-col">
            <ChatWindow
                conversationId={conversationId}
                conversationName={conversationName}
            />
        </div>
    )
}
