'use client'

import { useRouter, useParams } from 'next/navigation'
import { Bell, MessageSquare, AtSign, ClipboardList, UserPlus, UserMinus, Clock, AlertTriangle, Megaphone, Trash2 } from 'lucide-react'
import type { NotificationItem as NotificationItemData } from '@/types/notification'
import { archiveNotification, markNotificationRead } from '@/actions/notification-actions'
import { useChatContext } from '@/components/chat/ChatProvider'

interface Props {
    notification: NotificationItemData
    onLocalUpdate: (id: string, patch: Partial<NotificationItemData>) => void
    onLocalRemove: (id: string) => void
    onRequestClose?: () => void
}

const TYPE_ICON: Record<string, { icon: any; color: string; bg: string }> = {
    NEW_MESSAGE:           { icon: MessageSquare,  color: 'text-violet-400',  bg: 'bg-violet-500/15' },
    MENTION:               { icon: AtSign,         color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    GROUP_MEMBER_ADDED:    { icon: UserPlus,       color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    GROUP_MEMBER_REMOVED:  { icon: UserMinus,      color: 'text-red-400',     bg: 'bg-red-500/15' },
    GROUP_MEMBER_LEFT:     { icon: UserMinus,      color: 'text-zinc-400',    bg: 'bg-zinc-500/15' },
    GROUP_DELETED:         { icon: Megaphone,      color: 'text-red-400',     bg: 'bg-red-500/15' },
    TASK_ASSIGNED:         { icon: ClipboardList,  color: 'text-violet-400',  bg: 'bg-violet-500/15' },
    TASK_UNASSIGNED:       { icon: ClipboardList,  color: 'text-zinc-400',    bg: 'bg-zinc-500/15' },
    TASK_STATUS_CHANGED:   { icon: ClipboardList,  color: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
    TASK_DEADLINE_APPROACHING: { icon: Clock,      color: 'text-amber-400',   bg: 'bg-amber-500/15' },
    TASK_OVERDUE:          { icon: AlertTriangle,  color: 'text-red-400',     bg: 'bg-red-500/15' },
    TASK_COMMENT:          { icon: MessageSquare,  color: 'text-violet-400',  bg: 'bg-violet-500/15' },
}

function formatTime(iso: string) {
    const date = new Date(iso)
    const diff = Date.now() - date.getTime()
    const min = Math.floor(diff / 60000)
    if (min < 1) return 'just now'
    if (min < 60) return `${min}m`
    const hr = Math.floor(min / 60)
    if (hr < 24) return `${hr}h`
    const day = Math.floor(hr / 24)
    if (day < 7) return `${day}d`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationItem({ notification, onLocalUpdate, onLocalRemove, onRequestClose }: Props) {
    const router = useRouter()
    const params = useParams<{ workspaceId?: string }>()
    const { openConversation } = useChatContext()
    const meta = TYPE_ICON[notification.type] || { icon: Bell, color: 'text-zinc-400', bg: 'bg-zinc-500/15' }
    const Icon = meta.icon
    const messageCount = (notification.metadata?.messageCount as number) || 0

    const handleClick = async () => {
        if (!notification.isRead) {
            onLocalUpdate(notification.id, { isRead: true })
            void markNotificationRead(notification.id)
        }

        // Navigate based on type
        if (notification.conversationId) {
            const convName = (notification.metadata?.convLabel as string) || notification.title
            openConversation(notification.conversationId, convName)
        } else if (notification.taskId && params?.workspaceId) {
            // Open task — link to workspace queue, the task detail modal handles deep-linking via URL?
            // For now navigate to admin queue and rely on user to find the task.
            router.push(`/${params.workspaceId}/admin/queue?taskId=${notification.taskId}`)
        }

        onRequestClose?.()
    }

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation()
        onLocalRemove(notification.id)
        void archiveNotification(notification.id)
    }

    const senderName = notification.title.split(' · ')[0]

    return (
        <div
            onClick={handleClick}
            className={`group/notif relative flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors border-b border-white/[0.03] ${
                notification.isRead ? 'hover:bg-white/[0.02]' : 'bg-violet-500/[0.04] hover:bg-violet-500/[0.07]'
            }`}
        >
            {/* Avatar / icon */}
            {notification.avatarUrl ? (
                <div className="relative shrink-0">
                    <div
                        className="w-9 h-9 rounded-full bg-center bg-cover"
                        style={{ backgroundImage: `url(${notification.avatarUrl})` }}
                    />
                    <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${meta.bg} flex items-center justify-center border-2 border-zinc-900`}>
                        <Icon className={`w-2.5 h-2.5 ${meta.color}`} />
                    </div>
                </div>
            ) : (
                <div className={`w-9 h-9 rounded-full ${meta.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${meta.color}`} />
                </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                    <span className={`text-[12px] truncate ${notification.isRead ? 'text-zinc-300 font-medium' : 'text-white font-bold'}`}>
                        {notification.title}
                    </span>
                    <span className="text-[10px] text-zinc-600 shrink-0">{formatTime(notification.createdAt)}</span>
                </div>
                <div className="text-[11px] text-zinc-400 line-clamp-2 mt-0.5">
                    {messageCount > 1 ? `${senderName} sent ${messageCount} messages — ` : ''}
                    {notification.body}
                </div>
            </div>

            {/* Unread dot */}
            {!notification.isRead && (
                <div className="absolute top-3 right-2 w-2 h-2 rounded-full bg-violet-500 shadow-[0_0_6px_rgba(139,92,246,0.6)]" />
            )}

            {/* Archive button (hover) */}
            <button
                onClick={handleArchive}
                className="absolute right-2 bottom-2 opacity-0 group-hover/notif:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/15 cursor-pointer bg-transparent border-none"
                title="Archive"
            >
                <Trash2 className="w-3 h-3 text-red-400" />
            </button>
        </div>
    )
}
