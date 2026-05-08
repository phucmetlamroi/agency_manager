'use client'

import { useState, ReactNode } from 'react'
import { motion, useMotionValue, useTransform, animate, PanInfo } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

export interface SwipeAction {
    label: string
    icon: LucideIcon
    /** Tailwind bg + text classes */
    color: string
    onAction: () => void
}

interface SwipeableCardProps {
    children: ReactNode
    /** Action revealed when user swipes right (drags to right). */
    rightAction?: SwipeAction
    /** Action revealed when user swipes left (drags to left). */
    leftAction?: SwipeAction
    /** Minimum drag distance (px) to trigger action. Default 100. */
    threshold?: number
}

/**
 * Wraps a card with swipe-to-action gestures.
 * - Drag right reveals `rightAction` (positive — emerald/indigo)
 * - Drag left reveals `leftAction` (warning — amber/red)
 *
 * After threshold met + release → triggers action + snaps back.
 * Below threshold → snaps back without action.
 */
export default function SwipeableCard({
    children,
    rightAction,
    leftAction,
    threshold = 100,
}: SwipeableCardProps) {
    const x = useMotionValue(0)
    const [isDragging, setIsDragging] = useState(false)

    // Reveal action backgrounds opacity based on drag direction
    const rightOpacity = useTransform(x, [0, threshold], [0, 1])
    const leftOpacity = useTransform(x, [-threshold, 0], [1, 0])
    const rightScale = useTransform(x, [0, threshold], [0.7, 1])
    const leftScale = useTransform(x, [-threshold, 0], [1, 0.7])

    const handleDragEnd = (_: unknown, info: PanInfo) => {
        setIsDragging(false)
        const dragged = info.offset.x

        if (dragged >= threshold && rightAction) {
            // Animate off-screen then call action
            animate(x, 600, { duration: 0.2 })
            setTimeout(() => {
                rightAction.onAction()
                animate(x, 0, { duration: 0 })
            }, 180)
        } else if (dragged <= -threshold && leftAction) {
            animate(x, -600, { duration: 0.2 })
            setTimeout(() => {
                leftAction.onAction()
                animate(x, 0, { duration: 0 })
            }, 180)
        } else {
            // Snap back
            animate(x, 0, { type: 'spring', stiffness: 400, damping: 32 })
        }
    }

    return (
        <div className="relative">
            {/* Right-action background (revealed when swiping right) */}
            {rightAction && (
                <motion.div
                    style={{ opacity: rightOpacity }}
                    className={`absolute inset-0 rounded-2xl flex items-center justify-start pl-6 ${rightAction.color}`}
                >
                    <motion.div style={{ scale: rightScale }} className="flex items-center gap-2">
                        <rightAction.icon className="w-5 h-5" />
                        <span className="text-sm font-bold">{rightAction.label}</span>
                    </motion.div>
                </motion.div>
            )}

            {/* Left-action background (revealed when swiping left) */}
            {leftAction && (
                <motion.div
                    style={{ opacity: leftOpacity }}
                    className={`absolute inset-0 rounded-2xl flex items-center justify-end pr-6 ${leftAction.color}`}
                >
                    <motion.div style={{ scale: leftScale }} className="flex items-center gap-2">
                        <span className="text-sm font-bold">{leftAction.label}</span>
                        <leftAction.icon className="w-5 h-5" />
                    </motion.div>
                </motion.div>
            )}

            {/* Draggable card on top */}
            <motion.div
                drag={(rightAction || leftAction) ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                dragDirectionLock
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                style={{ x }}
                className={isDragging ? 'cursor-grabbing' : 'cursor-pointer'}
            >
                {children}
            </motion.div>
        </div>
    )
}
