'use client'

import { useEffect, useRef } from 'react'
import { pingHeartbeat } from '@/actions/tracking-actions'

const PING_INTERVAL_MS = 30000 // 30 seconds
const ACTIVITY_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes to mark as AWAY

export default function PresenceTracker({ currentUserId }: { currentUserId?: string }) {
    const lastActivityRef = useRef<number>(Date.now())
    const statusRef = useRef<'ONLINE' | 'AWAY'>('ONLINE')
    
    useEffect(() => {
        // Track DOM activity to determine if user is active
        const handleActivity = () => {
            lastActivityRef.current = Date.now()
            
            // If we were AWAY and just became active again, send an immediate ping
            if (statusRef.current === 'AWAY') {
                statusRef.current = 'ONLINE'
                pingHeartbeat('ONLINE', currentUserId).catch(() => {})
            }
        }

        const events = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart']
        events.forEach(eventName => {
            window.addEventListener(eventName, handleActivity, { passive: true })
        })

        // Initial Ping
        pingHeartbeat('ONLINE', currentUserId).catch(() => {})

        // Periodic Ping loop
        const intervalId = setInterval(() => {
            const timeSinceActive = Date.now() - lastActivityRef.current
            
            let currentStatus = statusRef.current
            if (timeSinceActive > ACTIVITY_TIMEOUT_MS) {
                currentStatus = 'AWAY'
                statusRef.current = 'AWAY'
            }

            pingHeartbeat(currentStatus, currentUserId).catch(() => {})
        }, PING_INTERVAL_MS)

        return () => {
            clearInterval(intervalId)
            events.forEach(eventName => {
                window.removeEventListener(eventName, handleActivity)
            })
        }
    }, [currentUserId])

    // This component renders absolutely nothing. It operates purely in the background.
    return null
}
