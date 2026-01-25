'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Polls the server to check if the user's role has changed.
 * If changed, refreshes the page to trigger Server Component redirects.
 */
export default function RoleWatcher({ currentRole, isTreasurer }: { currentRole: string, isTreasurer: boolean }) {
    const router = useRouter()

    useEffect(() => {
        const checkRole = async () => {
            try {
                const res = await fetch('/api/auth/role')
                if (!res.ok) return // Should handle auth error?

                const data = await res.json()
                const newRole = data.role
                const newIsTreasurer = data.isTreasurer

                // Check for Role Change OR Treasurer Status Change
                if ((newRole && newRole !== currentRole) || (newIsTreasurer !== isTreasurer)) {
                    console.log('Permission changed! Refreshing...')
                    router.refresh()
                }
            } catch (e) {
                console.error('Role check failed', e)
            }
        }

        // Check every 5 seconds for instant feedback
        const interval = setInterval(checkRole, 5000)

        // Check on window focus (tab switch)
        const onFocus = () => checkRole()
        window.addEventListener('focus', onFocus)

        return () => {
            clearInterval(interval)
            window.removeEventListener('focus', onFocus)
        }
    }, [currentRole, isTreasurer, router])

    return null // Invisible component
}
