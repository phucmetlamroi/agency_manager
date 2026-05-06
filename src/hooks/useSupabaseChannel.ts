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

        isSubscribedRef.current = false
        setIsSubscribed(false)

        const channel = supabase.channel(channelName, {
            config: { broadcast: { self: false } },
        })

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
                    setTimeout(() => { channel.subscribe() }, 2000)
                }
            })

        channelRef.current = channel

        return () => {
            supabase.removeChannel(channel)
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
