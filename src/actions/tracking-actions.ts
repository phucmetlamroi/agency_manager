'use server'

import { prisma } from '@/lib/db'
import { cookies, headers } from 'next/headers'

// Type definition for micro-events
export type TrackingEventPayload = {
    eventType: string
    featureName: string
    metadata?: Record<string, any>
}

// In-memory buffer for Batching (NOTE: In a true multi-instance serverless setup like Vercel, 
// this buffer resets per cold start. We'll use a timeout to flush before the lambda dies, 
// but for standard self-hosted/long-lived processes this is highly optimal).
let eventBuffer: Array<{
    sessionId: string;
    userId: string | null;
    eventType: string;
    featureName: string;
    metadata: any;
    createdAt: Date;
}> = []

const FLUSH_THRESHOLD = 50 
let flushTimeout: NodeJS.Timeout | null = null

async function flushEvents() {
    if (eventBuffer.length === 0) return

    // Clone and clear the buffer quickly to prevent race conditions
    const eventsToInsert = [...eventBuffer]
    eventBuffer = []
    
    if (flushTimeout) {
        clearTimeout(flushTimeout)
        flushTimeout = null
    }

    try {
        await prisma.event.createMany({
            data: eventsToInsert
        })
        console.log(`[Tracking] Flushed ${eventsToInsert.length} events to database.`)
    } catch (error) {
        console.error('[Tracking] Failed to flush events:', error)
        // If critical, could push them back to the buffer, 
        // but for analytics failing gracefully is better than OOM.
    }
}

/**
 * Tracks a micro-interaction (button click, modal open, test finish)
 */
export async function trackEvent(payload: TrackingEventPayload) {
    try {
        const cookieStore = await cookies()
        const sessionId = cookieStore.get('tracking_session_id')?.value

        if (!sessionId) return { success: false, reason: 'No session' }

        // We could extract the UserId from auth session, but for now we assume 
        // the session update logic handles user binding when they login.
        // We'll leave userId null initially, or fetch if needed.

        eventBuffer.push({
            sessionId,
            userId: null, // Depending on system architecture, we might bind this via a side-job
            eventType: payload.eventType,
            featureName: payload.featureName,
            metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
            createdAt: new Date()
        })

        if (eventBuffer.length >= FLUSH_THRESHOLD) {
            // Flush immediately if full
            await flushEvents()
        } else if (!flushTimeout) {
            // Otherwise, flush after 5 seconds
            flushTimeout = setTimeout(flushEvents, 5000)
        }

        return { success: true }
    } catch (error) {
        console.error('[Tracking Action Error]', error)
        return { success: false }
    }
}

/**
 * Pings the application with presence data (Heartbeat)
 */
export async function pingHeartbeat(status: 'ONLINE' | 'AWAY' = 'ONLINE', currentUserId?: string) {
    try {
        // Find the user context. If currentUserId is not provided, try to extract via headers or layout auth
        if (!currentUserId) return { success: false, reason: 'No User ID provided for heartbeat' }

        await prisma.userPresence.upsert({
            where: { userId: currentUserId },
            update: {
                status,
                lastHeartbeat: new Date()
            },
            create: {
                userId: currentUserId,
                status,
                lastHeartbeat: new Date()
            }
        })

        // NOTE: Prisma Pulse will catch this Mutation and broadcast it if setup.
        
        // Also update Session info if we have a session cookie
        const cookieStore = await cookies()
        const trackingId = cookieStore.get('tracking_session_id')?.value
        if (trackingId) {
            const h = await headers()
            const ip = h.get('x-client-ip') || 'Unknown'
            const country = h.get('x-client-country') || 'Unknown'
            const city = h.get('x-client-city') || 'Unknown'

            // Upsert session (track duration)
            await prisma.session.upsert({
                where: { id: trackingId },
                update: {
                    endTime: new Date(),
                    // Optional: could calculate durationSec here but better done dynamically or in cron
                },
                create: {
                    id: trackingId,
                    userId: currentUserId,
                    ipAddress: ip,
                    countryCode: country,
                    city: city,
                    startTime: new Date()
                }
            })
        }

        return { success: true }
    } catch (error) {
        console.error('[Heartbeat Error]', error)
        return { success: false }
    }
}
