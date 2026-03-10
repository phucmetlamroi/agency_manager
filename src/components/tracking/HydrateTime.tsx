'use client'

import { useState, useEffect } from 'react'

/**
 * Ensures a Date or ISO String is rendered safely to avoid Server/Client Hydration Mismatch
 * by converting it to the user's localized timezone on the client string.
 */
export default function HydrateTime({ 
    time, 
    format = 'PPP p' 
}: { 
    time: Date | string | null | undefined,
    format?: 'PP' | 'PPP' | 'p' | 'PPP p' | 'relative'
}) {
    const [hydrated, setHydrated] = useState(false)

    useEffect(() => {
        setHydrated(true)
    }, [])

    if (!time) return <span className="opacity-50">--</span>

    const dateObj = typeof time === 'string' ? new Date(time) : time

    if (!hydrated) {
        // Return a blank skeleton or generic UTC to prevent hydration errors
        return <span className="text-transparent border-b border-dashed border-zinc-700 select-none bg-zinc-800/20 rounded animate-pulse inline-block w-24 h-4" />
    }

    let displayString = ''
    try {
        if (format === 'PP') {
            displayString = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(dateObj)
        } else if (format === 'PPP') {
            displayString = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long' }).format(dateObj)
        } else if (format === 'p') {
            displayString = new Intl.DateTimeFormat('vi-VN', { timeStyle: 'short' }).format(dateObj)
        } else if (format === 'PPP p') {
            displayString = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'long', timeStyle: 'short' }).format(dateObj)
        } else if (format === 'relative') {
            const rtf = new Intl.RelativeTimeFormat('vi', { numeric: 'auto' })
            const daysDifference = Math.round((dateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            displayString = rtf.format(daysDifference, 'day')
        }
    } catch (e) {
        displayString = dateObj.toLocaleDateString()
    }

    return (
        <span suppressHydrationWarning title={dateObj.toISOString()}>
            {displayString}
        </span>
    )
}
