'use client'

/**
 * Auth Phase 3 — Cloudflare Turnstile widget component.
 *
 * Loads Turnstile script lazily via Next.js Script. Renders invisible/managed widget
 * và gọi onToken khi user passes challenge.
 *
 * Token TTL: 300 seconds (5 phút) sau generation. Single-use.
 *
 * Usage:
 *   <TurnstileWidget onToken={(t) => setToken(t)} onError={() => ...} />
 *
 * Falls back gracefully nếu NEXT_PUBLIC_TURNSTILE_SITE_KEY chưa configure (dev mode).
 */

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'

declare global {
    interface Window {
        turnstile?: {
            render: (
                container: HTMLElement | string,
                options: {
                    sitekey: string
                    callback?: (token: string) => void
                    'error-callback'?: () => void
                    'expired-callback'?: () => void
                    'timeout-callback'?: () => void
                    appearance?: 'always' | 'execute' | 'interaction-only'
                    theme?: 'light' | 'dark' | 'auto'
                    size?: 'normal' | 'flexible' | 'compact' | 'invisible'
                }
            ) => string
            reset: (widgetId?: string) => void
            remove: (widgetId?: string) => void
        }
    }
}

interface Props {
    onToken: (token: string) => void
    onError?: () => void
    onExpire?: () => void
    /**
     * 'always' = widget luôn hiện (user click "I'm not a robot"). KHUYẾN NGHỊ.
     * 'execute' = widget ẩn, validate khi gọi turnstile.execute() programmatically.
     * 'interaction-only' = ẩn cho user "trusted", chỉ hiện khi suspicious.
     *   ⚠️ KHÔNG dùng cho signup vì có thể không tự issue token.
     */
    appearance?: 'always' | 'execute' | 'interaction-only'
    theme?: 'light' | 'dark' | 'auto'
    /** Force re-render khi key đổi — dùng để reset widget sau form submit */
    resetKey?: number
}

export default function TurnstileWidget({
    onToken,
    onError,
    onExpire,
    appearance = 'always',  // Đổi từ 'interaction-only' → 'always' để đảm bảo
                            // widget LUÔN render và issue token. Bug trước:
                            // 'interaction-only' không tự cấp token nếu không
                            // detect "suspicious behavior" → button submit bị
                            // disabled forever vì turnstileToken=''.
    theme = 'dark',
    resetKey = 0,
}: Props) {
    const containerRef = useRef<HTMLDivElement>(null)
    const widgetIdRef = useRef<string | null>(null)
    const [scriptLoaded, setScriptLoaded] = useState(false)
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

    useEffect(() => {
        // No site key → bypass with placeholder token. Production server với
        // TURNSTILE_SECRET_KEY set sẽ reject token này nên vẫn an toàn.
        // Lý do bypass: nếu site key thiếu hoặc widget script bị block,
        // form không bị disabled vô tận — user vẫn submit được, server
        // có quyền reject.
        if (!siteKey) {
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[Turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY not set — bypassing in dev.')
            } else {
                console.warn('[Turnstile] Site key missing in production — server-side check will reject.')
            }
            onToken('no-turnstile-configured')
            return
        }

        if (!scriptLoaded || !containerRef.current || !window.turnstile) return

        // Cleanup previous instance if resetting
        if (widgetIdRef.current) {
            try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
            widgetIdRef.current = null
        }

        try {
            const id = window.turnstile.render(containerRef.current, {
                sitekey: siteKey,
                appearance,
                theme,
                callback: (token) => onToken(token),
                'error-callback': () => onError?.(),
                'expired-callback': () => onExpire?.(),
            })
            widgetIdRef.current = id
        } catch (e) {
            console.error('[Turnstile] render error:', e)
            onError?.()
        }

        return () => {
            if (widgetIdRef.current && window.turnstile) {
                try { window.turnstile.remove(widgetIdRef.current) } catch { /* ignore */ }
                widgetIdRef.current = null
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scriptLoaded, siteKey, resetKey])

    if (!siteKey) return null

    return (
        <>
            <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                strategy="lazyOnload"
                onLoad={() => setScriptLoaded(true)}
            />
            <div ref={containerRef} className="turnstile-container" />
        </>
    )
}
