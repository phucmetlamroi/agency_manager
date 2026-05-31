'use client'

import { useEffect, useState } from 'react'
import { Loader2, MessagesSquare } from 'lucide-react'
import { getOrCreateTaskChannel, type HubChannelDTO } from '@/actions/channel-actions'
import ChannelView from '@/components/hub/ChannelView'

/**
 * [Phase 6] Per-task discussion. Lazily resolves the task's TASK-type channel
 * then renders the same realtime ChannelView used by the Knowledge Hub.
 */
export default function TaskChatPanel({
    workspaceId,
    taskId,
    currentUserId,
    isAdmin,
}: {
    workspaceId: string
    taskId: string
    currentUserId?: string
    isAdmin: boolean
}) {
    const [channel, setChannel] = useState<HubChannelDTO | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setChannel(null)
        setError(null)
        getOrCreateTaskChannel(workspaceId, taskId)
            .then((res) => {
                if (cancelled) return
                if ('error' in res) setError(res.error)
                else setChannel(res.channel)
            })
            .catch(() => {
                if (!cancelled) setError('Không mở được kênh thảo luận')
            })
        return () => {
            cancelled = true
        }
    }, [workspaceId, taskId])

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-zinc-500">
                <MessagesSquare className="w-8 h-8 text-zinc-700" />
                {error}
            </div>
        )
    }

    if (!channel) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang mở thảo luận…
            </div>
        )
    }

    return (
        <div className="h-[58vh] min-h-[360px] rounded-2xl border border-white/10 bg-zinc-950/40 overflow-hidden">
            <ChannelView
                workspaceId={workspaceId}
                channel={channel}
                currentUserId={currentUserId ?? ''}
                isAdmin={isAdmin}
            />
        </div>
    )
}
