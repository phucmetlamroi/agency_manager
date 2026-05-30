'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

/**
 * Scroll-triggered reveal (replaces the prototype's `.reveal` + JS in-view check).
 * Fades + slides up once when entering the viewport; respects reduced-motion.
 */
export function Reveal({
    children,
    delay = 0,
    className,
}: {
    children: ReactNode
    delay?: number
    className?: string
}) {
    const reduce = useReducedMotion()

    if (reduce) {
        return <div className={className}>{children}</div>
    }

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '0px 0px -10% 0px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
        >
            {children}
        </motion.div>
    )
}

/** Smooth-scroll to an in-page section by id. */
export function scrollToId(id: string) {
    if (typeof document === 'undefined') return
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
