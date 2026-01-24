'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Polls the server to check if the user's role has changed.
 * If changed, refreshes the page to trigger Server Component redirects.
 */
export default function RoleWatcher({ currentRole }: { currentRole: string }) {
    const router = useRouter()

    useEffect(() => {
        const checkRole = async () => {
            try {
                const res = await fetch('/api/auth/role')
                if (!res.ok) return // Should handle auth error?

                const data = await res.json()
                const newRole = data.role

                // If role changed (e.g. USER -> ADMIN or ADMIN -> USER)
                // Or if role became null (User deleted/banned)
                if (newRole && newRole !== currentRole) {
                    console.log('Role changed! Refreshing...')
                    router.refresh()
                }
            } catch (e) {
                console.error('Role check failed', e)
            }
        }

        // Check every 30 seconds
        const interval = setInterval(checkRole, 30000)

        // Check on window focus (tab switch)
        const onFocus = () => checkRole()
        window.addEventListener('focus', onFocus)

        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', onFocus)
        }
    }, [currentRole, router])

    return null // Invisible component
}
