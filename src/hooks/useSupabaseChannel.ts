'use client'

import { useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useSupabaseChannel(
    channelName: string,
    onEvent: (event: string, payload: any) => void,
    enabled = true
) {
    const channelRef = useRef<RealtimeChannel | null>(null)
    const onEventRef = useRef(onEvent)
    onEventRef.current = onEvent

    useEffect(() => {
        if (!enabled || !channelName) return

        const channel = supabase.channel(channelName)

        channel
            .on('broadcast', { event: '*' }, ({ event, payload }) => {
                onEventRef.current(event, payload)
            })
            .subscribe()

        channelRef.current = channel

        return () => {
            supabase.removeChannel(channel)
            channelRef.current = null
        }
    }, [channelName, enabled])

    const broadcast = useCallback(
        (event: string, payload: any) => {
            channelRef.current?.send({
                type: 'broadcast',
                event,
                payload,
            })
        },
        []
    )

    return { broadcast }
}
