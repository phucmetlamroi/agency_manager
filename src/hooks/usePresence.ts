'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

/**
 * [Phase 2 · presence] Track who's online on a Supabase Presence channel.
 * Ephemeral — no DB, auto join/leave/sync, auto-cleanup on disconnect. Returns
 * the set of online userIds. Pass `me=null` to disable (e.g. before auth).
 */
export function usePresence(topic: string, me: string | null): Set<string> {
    const [online, setOnline] = useState<Set<string>>(new Set())
    const channelRef = useRef<RealtimeChannel | null>(null)

    useEffect(() => {
        if (!supabase || !topic || !me) return

        let channel: RealtimeChannel
        try {
            channel = supabase.channel(topic, { config: { presence: { key: me } } })
        } catch {
            return
        }

        const sync = () => {
            try {
                const state = channel.presenceState()
                setOnline(new Set(Object.keys(state)))
            } catch {
                /* ignore */
            }
        }

        try {
            channel
                .on('presence', { event: 'sync' }, sync)
                .on('presence', { event: 'join' }, sync)
                .on('presence', { event: 'leave' }, sync)
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        channel.track({ online_at: new Date().toISOString() }).catch(() => {})
                    }
                })
        } catch {
            /* ignore */
        }

        channelRef.current = channel
        return () => {
            try {
                channel.untrack().catch(() => {})
                supabase?.removeChannel(channel)
            } catch {
                /* ignore */
            }
            channelRef.current = null
            setOnline(new Set())
        }
    }, [topic, me])

    return online
}
