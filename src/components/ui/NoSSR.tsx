'use client'

import React, { useEffect, useState } from 'react'

/**
 * Wrapper to prevent components (like Recharts) from rendering on the server side
 * during Next.js static generation, which can cause "TypeError: t.mask is not a function".
 */
const NoSSR = ({ children }: { children: React.ReactNode }) => {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!mounted) {
        // Return a placeholder with the same aspect ratio or just null/loading
        return null
    }

    return <>{children}</>
}

export default NoSSR
