'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
    const router = useRouter()

    useEffect(() => {
        // 1. Refresh on Interval (if visible)
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                router.refresh()
            }
        }, intervalMs)

        // 2. Refresh immediately on Window Focus (User returns to tab)
        const onFocus = () => {
            // console.log('Tab Focused -> Refreshing Data')
            router.refresh()
        }

        window.addEventListener('focus', onFocus)

        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', onFocus)
        }
    }, [router, intervalMs])

    return null // This component renders nothing
}
