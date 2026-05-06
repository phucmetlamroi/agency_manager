'use client'

import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { useChatContext } from '@/components/chat/ChatProvider'
import { getOrCreateTaskConversation } from '@/actions/chat-actions'
import { toast } from 'sonner'

interface TaskChatMenuItemProps {
    taskId: string
    workspaceId: string
    hasConversation: boolean
    conversationId: string | null
}

export default function TaskChatMenuItem({
    taskId,
    workspaceId,
    hasConversation,
    conversationId,
}: TaskChatMenuItemProps) {
    const { openConversation } = useChatContext()
    const [loading, setLoading] = useState(false)

    const handleClick = async () => {
        setLoading(true)
        try {
            const result = await getOrCreateTaskConversation(taskId, workspaceId)
            if (result.error) {
                toast.error(result.error)
                return
            }
            if (result.data?.conversationId) {
                openConversation(result.data.conversationId, result.data.conversationName || undefined)
            }
        } catch {
            toast.error('Failed to open chat')
        } finally {
            setLoading(false)
        }
    }

    return (
        <DropdownMenuItem onClick={handleClick} disabled={loading}>
            <MessageSquare className="mr-2 h-4 w-4" />
            {loading ? 'Opening...' : hasConversation ? 'Open Chat' : 'New Chat'}
        </DropdownMenuItem>
    )
}
