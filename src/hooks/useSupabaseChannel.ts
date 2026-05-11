'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useSupabaseChannel(
    channelName: string,
    onEvent: (event: string, payload: any) => void,
    enabled = true
) {
    const channelRef = useRef<RealtimeChannel | null>(null)
    const onEventRef = useRef(onEvent)
    const isSubscribedRef = useRef(false)
    const [isSubscribed, setIsSubscribed] = useState(false)
    const pendingBroadcasts = useRef<Array<{ event: string; payload: any }>>([])
    onEventRef.current = onEvent

    useEffect(() => {
        if (!enabled || !channelName) return
        // [Sprint U] Resilience: supabase=null khi env missing/invalid
        // → realtime disabled, app KHÔNG crash.
        if (!supabase) return

        isSubscribedRef.current = false
        setIsSubscribed(false)

        // [Sprint U] Wrap channel construction trong try/catch — iOS Safari
        // có thể throw "WebSocket not available: The operation is insecure"
        // nếu Supabase URL invalid hoặc CSP block WebSocket.
        let channel: RealtimeChannel
        try {
            channel = supabase.channel(channelName, {
                config: { broadcast: { self: false } },
            })
        } catch (err) {
            console.warn('[useSupabaseChannel] channel construction failed (realtime disabled):', err)
            return
        }

        try {
            channel
                .on('broadcast', { event: '*' }, ({ event, payload }) => {
                    onEventRef.current(event, payload)
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        isSubscribedRef.current = true
                        setIsSubscribed(true)
                        // Flush any broadcasts that were queued while subscribing
                        const pending = pendingBroadcasts.current.splice(0)
                        pending.forEach(({ event, payload }) => {
                            channel.send({ type: 'broadcast', event, payload }).catch(() => {})
                        })
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        isSubscribedRef.current = false
                        setIsSubscribed(false)
                        // [Sprint U] Guard against retry loop on environments
                        // where WebSocket always fails (iOS Safari + bad env).
                        // Don't auto-retry indefinitely — log + give up.
                        console.warn('[useSupabaseChannel] subscribe failed status=', status)
                    }
                })
        } catch (err) {
            console.warn('[useSupabaseChannel] subscribe call threw:', err)
        }

        channelRef.current = channel

        return () => {
            try {
                supabase?.removeChannel(channel)
            } catch {
                // ignore — supabase or channel may have been torn down
            }
            channelRef.current = null
            isSubscribedRef.current = false
            setIsSubscribed(false)
            pendingBroadcasts.current = []
        }
    }, [channelName, enabled])

    const broadcast = useCallback(
        async (event: string, payload: any) => {
            const channel = channelRef.current
            if (!channel) return

            // If not subscribed yet, queue the broadcast for when subscription confirms
            if (!isSubscribedRef.current) {
                pendingBroadcasts.current.push({ event, payload })
                return
            }

            try {
                await channel.send({ type: 'broadcast', event, payload })
            } catch {
                // Broadcast failed — polling will catch up
            }
        },
        []
    )

    return { broadcast, isSubscribed }
}
