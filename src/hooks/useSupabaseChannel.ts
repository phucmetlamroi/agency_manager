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
    const [isSubscribed, setIsSubscribed] = useState(false)
    onEventRef.current = onEvent

    useEffect(() => {
        if (!enabled || !channelName) return

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
                    setIsSubscribed(true)
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    setIsSubscribed(false)
                    // Retry subscription after a short delay
                    setTimeout(() => {
                        channel.subscribe()
                    }, 2000)
                }
            })

        channelRef.current = channel

        return () => {
            supabase.removeChannel(channel)
            channelRef.current = null
            setIsSubscribed(false)
        }
    }, [channelName, enabled])

    const broadcast = useCallback(
        async (event: string, payload: any) => {
            if (!channelRef.current) return
            try {
                await channelRef.current.send({
                    type: 'broadcast',
                    event,
                    payload,
                })
            } catch {
                // Broadcast failed silently — polling will catch up
            }
        },
        []
    )

    return { broadcast, isSubscribed }
}
