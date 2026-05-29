'use client'

import { createContext, useContext, useEffect } from 'react'
import { initNotificationSound } from '@/lib/notification-sound'

interface NotificationContextValue {
    currentUserId: string
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

export function useNotificationContext() {
    const ctx = useContext(NotificationContext)
    if (!ctx) throw new Error('useNotificationContext must be used within NotificationProvider')
    return ctx
}

/**
 * Lightweight app-wide context that exposes the current user's id to client
 * components that need it (e.g. NotificationBell for its realtime channel).
 *
 * Replaces the former ChatProvider — keeps notification sound unlock on first
 * user gesture so task-notification pings can play.
 */
export function NotificationProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
    useEffect(() => {
        initNotificationSound()
    }, [])

    return (
        <NotificationContext.Provider value={{ currentUserId: userId }}>
            {children}
        </NotificationContext.Provider>
    )
}
