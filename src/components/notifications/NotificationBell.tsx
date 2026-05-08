'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell } from 'lucide-react'
import { useSupabaseChannel } from '@/hooks/useSupabaseChannel'
import { getUserNotificationChannel, CHAT_EVENTS } from '@/lib/chat-channels'
import { getUnreadNotificationCount } from '@/actions/notification-actions'
import { useChatContext } from '@/components/chat/ChatProvider'
import { playNotificationSound } from '@/lib/notification-sound'
import { NotificationPanel } from './NotificationPanel'
import type { NotificationItem as NotificationItemData } from '@/types/notification'

interface Props {
    /** Optional override styling — for desktop sidebar vs mobile header */
    className?: string
}

export function NotificationBell({ className = '' }: Props) {
    const { currentUserId } = useChatContext()
    const [open, setOpen] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const [incoming, setIncoming] = useState<NotificationItemData[]>([])
    const ref = useRef<HTMLDivElement>(null)

    // Initial unread fetch + 30s poll fallback
    useEffect(() => {
        const fetchCount = async () => {
            const res = await getUnreadNotificationCount()
            if (res.data) setUnreadCount(res.data.count)
        }
        fetchCount()
        const interval = setInterval(fetchCount, 30000)
        return () => clearInterval(interval)
    }, [])

    // Close panel on outside click
    useEffect(() => {
        if (!open) return
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', onClick)
        return () => document.removeEventListener('mousedown', onClick)
    }, [open])

    // Realtime listener — receive NOTIFICATION_NEW from server-side broadcast
    const handleEvent = useCallback((event: string, payload: any) => {
        if (event === CHAT_EVENTS.NOTIFICATION_NEW && payload?.id) {
            setIncoming(prev => [payload, ...prev])
            setUnreadCount(prev => prev + 1)
            // Play subtle sound — server already gates by mute, but this is a final UX
            // override for important/mention events. The chat-side already plays for
            // chat events; this fires a small ping for non-chat (task) events too.
            if (payload.type === 'TASK_ASSIGNED' || payload.type === 'TASK_STATUS_CHANGED' || payload.type === 'TASK_DEADLINE_APPROACHING' || payload.type === 'TASK_OVERDUE') {
                playNotificationSound()
            }
        }
    }, [])

    useSupabaseChannel(getUserNotificationChannel(currentUserId), handleEvent, true)

    return (
        <div ref={ref} className={`relative ${className}`}>
            <button
                onClick={() => setOpen(o => !o)}
                className="relative p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer bg-transparent border-none"
                title="Notifications"
            >
                <Bell className={`w-[18px] h-[18px] ${unreadCount > 0 ? 'text-violet-400' : 'text-zinc-400'}`} />
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center px-1 shadow-[0_0_8px_rgba(139,92,246,0.4)] border-2 border-zinc-950">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <NotificationPanel
                isOpen={open}
                onClose={() => setOpen(false)}
                onUnreadCountChange={setUnreadCount}
                incoming={incoming}
                onIncomingConsumed={() => setIncoming([])}
            />
        </div>
    )
}
