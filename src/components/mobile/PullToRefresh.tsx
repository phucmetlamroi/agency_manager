'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Loader2, ArrowDown } from 'lucide-react'

interface PullToRefreshProps {
    children: React.ReactNode
    onRefresh: () => Promise<void> | void
    /** Threshold (px) to trigger refresh. Default 80. */
    threshold?: number
    /** Max pull distance (px). Default 120. */
    maxPull?: number
}

/**
 * Mobile pull-to-refresh wrapper using Framer Motion drag.
 * Only triggers when user is scrolled to top (scrollY === 0).
 */
export default function PullToRefresh({
    children,
    onRefresh,
    threshold = 80,
    maxPull = 120,
}: PullToRefreshProps) {
    const [isRefreshing, setIsRefreshing] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const y = useMotionValue(0)

    // Indicator opacity / rotation based on pull distance
    const indicatorOpacity = useTransform(y, [0, threshold], [0, 1])
    const indicatorRotation = useTransform(y, [0, threshold], [0, 180])
    const indicatorScale = useTransform(y, [0, threshold], [0.7, 1])

    const handleDragEnd = useCallback(async () => {
        const pulled = y.get()
        if (pulled >= threshold && !isRefreshing) {
            setIsRefreshing(true)
            // Hold the indicator at threshold while refreshing
            animate(y, threshold * 0.6, { duration: 0.2 })
            try {
                await onRefresh()
            } finally {
                setIsRefreshing(false)
                animate(y, 0, { duration: 0.3 })
            }
        } else {
            // Snap back
            animate(y, 0, { type: 'spring', stiffness: 300, damping: 30 })
        }
    }, [y, threshold, isRefreshing, onRefresh])

    return (
        <div ref={containerRef} className="relative">
            {/* Pull indicator */}
            <motion.div
                style={{
                    opacity: indicatorOpacity,
                    scale: indicatorScale,
                    y,
                }}
                className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-12 z-50 pointer-events-none flex flex-col items-center gap-1"
            >
                <div className="w-10 h-10 rounded-full bg-zinc-900/90 backdrop-blur-xl border border-white/10 shadow-lg flex items-center justify-center">
                    {isRefreshing ? (
                        <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
                    ) : (
                        <motion.div style={{ rotate: indicatorRotation }}>
                            <ArrowDown className="w-5 h-5 text-indigo-400" />
                        </motion.div>
                    )}
                </div>
            </motion.div>

            {/* Draggable content */}
            <motion.div
                drag="y"
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.5 }}
                dragDirectionLock
                onDragEnd={handleDragEnd}
                onDragStart={() => {
                    // Only allow drag if scrolled to top
                    if ((containerRef.current?.scrollTop ?? 0) > 0) {
                        animate(y, 0, { duration: 0 })
                    }
                }}
                style={{ y }}
            >
                {children}
            </motion.div>
        </div>
    )
}
