'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AutoRefresh({ intervalMs = 60000 }: { intervalMs?: number }) {
    const router = useRouter()

    useEffect(() => {
        // Only refresh if the tab is visible to save resources
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                router.refresh()
            }
        }, intervalMs)

        return () => clearInterval(interval)
    }, [router, intervalMs])

    return null // This component renders nothing
}
