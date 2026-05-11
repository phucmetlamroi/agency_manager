'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * [Sprint U] Resilient Supabase init.
 *
 * Trước đây dùng non-null assertion `!` cho env vars — nếu env missing tại
 * runtime (vd Vercel chưa set NEXT_PUBLIC_SUPABASE_URL), createClient nhận
 * undefined → Supabase realtime constructs invalid WebSocket URL → iOS Safari
 * throws "WebSocket not available: The operation is insecure" → unhandled
 * exception → toàn app crash (user thấy "Có lỗi xảy ra").
 *
 * Now: nếu env thiếu hoặc invalid → export `null`. Callers (NotificationBell,
 * ChatProvider, useSupabaseChannel, ...) early-return khi `supabase` null →
 * app vẫn render bình thường, chỉ mất realtime features (user refresh thủ công).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let _supabase: SupabaseClient | null = null
if (supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith('https://')) {
    try {
        _supabase = createClient(supabaseUrl, supabaseAnonKey, {
            realtime: {
                params: { eventsPerSecond: 10 },
            },
        })
    } catch (err) {
        console.error('[supabase] createClient failed:', err)
        _supabase = null
    }
} else {
    // Log once (warning) for ops visibility — server log via Vercel
    if (typeof window !== 'undefined') {
        console.warn(
            '[supabase] NEXT_PUBLIC_SUPABASE_URL or _ANON_KEY missing/invalid — realtime features disabled. URL=',
            supabaseUrl,
        )
    }
}

export const supabase = _supabase
