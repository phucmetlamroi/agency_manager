'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

/**
 * 5A: Page-level entrance animation wrapper.
 * Wraps portal page content with a subtle fade-slide-in.
 */
export default function PortalPageTransition({ children }: { children: ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
            {children}
        </motion.div>
    )
}
