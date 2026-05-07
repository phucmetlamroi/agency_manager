'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, CheckCheck, X } from 'lucide-react'
import { getNotifications, markAllNotificationsRead } from '@/actions/notification-actions'
import { NotificationItem } from './NotificationItem'
import { EmptyNotification } from './EmptyNotification'
import type { NotificationItem as NotificationItemData } from '@/types/notification'
import { toast } from 'sonner'

interface Props {
    isOpen: boolean
    onClose: () => void
    onUnreadCountChange: (count: number) => void
    /** Externally-fed incoming notifications (from realtime listener at parent). */
    incoming: NotificationItemData[]
    onIncomingConsumed: () => void
}

type Tab = 'all' | 'unread'

export function NotificationPanel({ isOpen, onClose, onUnreadCountChange, incoming, onIncomingConsumed }: Props) {
    const [items, setItems] = useState<NotificationItemData[]>([])
    const [tab, setTab] = useState<Tab>('all')
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(false)
    const cursorRef = useRef<string | null>(null)

    const load = useCallback(async (reset = false) => {
        setLoading(true)
        try {
            const cursor = reset ? undefined : (cursorRef.current || undefined)
            const res = await getNotifications({
                cursor,
                limit: 20,
                unreadOnly: tab === 'unread',
            })
            if (res.data) {
                setItems(prev => reset ? res.data.notifications : [...prev, ...res.data.notifications])
                cursorRef.current = res.data.nextCursor
                setHasMore(!!res.data.nextCursor)
                onUnreadCountChange(res.data.unreadCount)
            }
        } finally {
            setLoading(false)
        }
    }, [tab, onUnreadCountChange])

    useEffect(() => {
        if (isOpen) {
            cursorRef.current = null
            load(true)
        }
    }, [isOpen, tab, load])

    // Merge incoming realtime notifications
    useEffect(() => {
        if (incoming.length === 0) return
        setItems(prev => {
            const map = new Map(prev.map(n => [n.id, n]))
            for (const n of incoming) {
                map.set(n.id, n)  // upsert
            }
            return Array.from(map.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        })
        onIncomingConsumed()
    }, [incoming, onIncomingConsumed])

    const handleLocalUpdate = useCallback((id: string, patch: Partial<NotificationItemData>) => {
        setItems(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
        if (patch.isRead) {
            // Recompute unread count
            const count = items.filter(n => n.id !== id && !n.isRead).length
            onUnreadCountChange(count)
        }
    }, [items, onUnreadCountChange])

    const handleLocalRemove = useCallback((id: string) => {
        setItems(prev => prev.filter(n => n.id !== id))
    }, [])

    const handleMarkAllRead = async () => {
        const res = await markAllNotificationsRead()
        if (res.error) {
            toast.error(res.error)
            return
        }
        setItems(prev => prev.map(n => ({ ...n, isRead: true })))
        onUnreadCountChange(0)
        toast.success(`Marked ${res.data?.count || 0} as read`)
    }

    const visible = tab === 'unread' ? items.filter(n => !n.isRead) : items

    if (!isOpen) return null

    return (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[600px] bg-zinc-900/95 backdrop-blur-2xl rounded-2xl border border-violet-500/20 shadow-[0_24px_60px_rgba(0,0,0,0.5)] z-50 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-violet-500/10">
                <h3 className="text-[14px] font-bold text-white m-0">Notifications</h3>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-white/10 cursor-pointer bg-transparent border-none text-[11px] text-zinc-400"
                        title="Mark all as read"
                    >
                        <CheckCheck className="w-3 h-3" /> All read
                    </button>
                    <button onClick={onClose} className="p-1 rounded-md hover:bg-white/10 cursor-pointer bg-transparent border-none">
                        <X className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 px-2 py-1.5 border-b border-white/[0.05]">
                {([
                    { id: 'all' as Tab, label: 'All' },
                    { id: 'unread' as Tab, label: 'Unread' },
                ] as const).map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 py-1 rounded-md border-none cursor-pointer text-[11px] font-semibold transition-colors ${
                            tab === t.id
                                ? 'bg-violet-500/15 text-violet-400'
                                : 'bg-transparent text-zinc-500 hover:bg-white/5'
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
                {loading && items.length === 0 && (
                    <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin w-5 h-5 text-violet-500" />
                    </div>
                )}

                {!loading && visible.length === 0 && (
                    <EmptyNotification message={tab === 'unread' ? 'No unread notifications' : 'No notifications yet'} />
                )}

                {visible.map(n => (
                    <NotificationItem
                        key={n.id}
                        notification={n}
                        onLocalUpdate={handleLocalUpdate}
                        onLocalRemove={handleLocalRemove}
                        onRequestClose={onClose}
                    />
                ))}

                {hasMore && (
                    <button
                        onClick={() => load(false)}
                        disabled={loading}
                        className="w-full py-2 text-[11px] text-violet-400 cursor-pointer bg-transparent border-none border-t border-white/[0.03] hover:bg-violet-500/[0.05] disabled:opacity-50"
                    >
                        {loading ? 'Loading...' : 'Load more'}
                    </button>
                )}
            </div>
        </div>
    )
}
