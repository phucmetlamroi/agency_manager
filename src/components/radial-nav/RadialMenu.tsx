'use client'

import { useEffect, useRef, createElement } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings } from 'lucide-react'
import { getIcon, COLOR_MAP, FALLBACK_COLOR, RADIAL_RADIUS } from './radial-nav.constants'
import type { RadialSegment } from './radial-nav.types'

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type RadialMenuProps = {
    segments: RadialSegment[]
    origin: { x: number; y: number }
    hoveredIndex: number | null
    onSelect: (index: number) => void
    onClose: () => void
    onOpenConfig: () => void
}

// ─────────────────────────────────────────────
// Polar Math Utilities
// ─────────────────────────────────────────────
function getSegmentPosition(index: number, total: number, radius: number) {
    // Start from top (12 o'clock), go clockwise
    const angleRad = (2 * Math.PI * index) / total - Math.PI / 2
    return {
        x: Math.cos(angleRad) * radius,
        y: Math.sin(angleRad) * radius,
    }
}

// ─────────────────────────────────────────────
// Animation Variants
// ─────────────────────────────────────────────
const backdropVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.12 } },
    exit: { opacity: 0, transition: { duration: 0.1 } },
}

const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
    exit: { transition: { staggerChildren: 0.02, staggerDirection: -1 } },
}

const segmentVariants = {
    hidden: { opacity: 0, scale: 0.2, x: 0, y: 0 },
    visible: (pos: { x: number; y: number }) => ({
        opacity: 1,
        scale: 1,
        x: pos.x,
        y: pos.y,
        transition: { type: 'spring' as const, stiffness: 380, damping: 26 },
    }),
    exit: (pos: { x: number; y: number }) => ({
        opacity: 0,
        scale: 0.3,
        x: pos.x * 0.4,
        y: pos.y * 0.4,
        transition: { duration: 0.12, ease: 'easeIn' as const },
    }),
}

const centerVariants = {
    hidden: { opacity: 0, scale: 0 },
    visible: { opacity: 1, scale: 1, transition: { type: 'spring' as const, stiffness: 500, damping: 30 } },
    exit: { opacity: 0, scale: 0, transition: { duration: 0.1 } },
}

// ─────────────────────────────────────────────
// SVG Lines (center to segment)
// ─────────────────────────────────────────────
function RadialLines({ segments, origin }: { segments: RadialSegment[]; origin: { x: number; y: number } }) {
    const n = segments.length
    return (
        <svg
            className="pointer-events-none fixed inset-0 z-[99995]"
            style={{ width: '100vw', height: '100vh' }}
        >
            {segments.map((_, i) => {
                const pos = getSegmentPosition(i, n, RADIAL_RADIUS)
                return (
                    <line
                        key={i}
                        x1={origin.x}
                        y1={origin.y}
                        x2={origin.x + pos.x}
                        y2={origin.y + pos.y}
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="1"
                    />
                )
            })}
        </svg>
    )
}

// ─────────────────────────────────────────────
// Individual Segment
// ─────────────────────────────────────────────
function RadialSegmentItem({
    segment,
    position,
    isHovered,
    onClick,
}: {
    segment: RadialSegment
    position: { x: number; y: number }
    isHovered: boolean
    onClick: () => void
}) {
    const colors = segment.color ? (COLOR_MAP[segment.color] ?? FALLBACK_COLOR) : FALLBACK_COLOR
    const isUnassigned = !segment.path

    return (
        <motion.div
            className="absolute -translate-x-1/2 -translate-y-1/2"
            custom={position}
            variants={segmentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{ left: 0, top: 0, originX: 0.5, originY: 0.5 }}
        >
            {/* Hover glow ring */}
            <AnimatePresence>
                {isHovered && (
                    <motion.div
                        className="absolute inset-0 rounded-full blur-md"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1.4 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.15 }}
                        style={{
                            background: `radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)`,
                        }}
                    />
                )}
            </AnimatePresence>

            <motion.button
                onClick={() => {
                    if (!isUnassigned) onClick()
                }}
                animate={{
                    scale: isHovered ? 1.18 : 1,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className={`
                    relative w-14 h-14 rounded-full flex flex-col items-center justify-center
                    backdrop-blur-xl border shadow-lg
                    transition-colors duration-150
                    ${isUnassigned
                        ? 'bg-zinc-950/50 border-white/10 cursor-default'
                        : isHovered
                        ? `${colors.bg} ${colors.border} ${colors.glow} shadow-lg`
                        : 'bg-zinc-950/70 border-white/10 shadow-black/40 cursor-pointer'
                    }
                `}
                title={segment.label}
            >
                {createElement(getIcon(segment.icon), {
                    className: `w-5 h-5 transition-colors duration-150 ${
                        isUnassigned ? 'text-zinc-600' : (isHovered ? colors.text : 'text-zinc-400')
                    }`,
                })}
            </motion.button>

            <motion.div
                className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
            >
                <span className={`
                    text-xs font-semibold px-2 py-0.5 rounded-full
                    bg-zinc-900/90 border border-white/10
                    backdrop-blur-sm
                    ${isUnassigned ? 'text-zinc-500' : (isHovered ? colors.text : 'text-zinc-400')}
                `}>
                    {segment.label}
                </span>
            </motion.div>
        </motion.div>
    )
}

// ─────────────────────────────────────────────
// Main RadialMenu
// ─────────────────────────────────────────────
export function RadialMenu({
    segments,
    origin,
    hoveredIndex,
    onSelect,
    onClose,
    onOpenConfig,
}: RadialMenuProps) {
    const mounted = useRef(false)
    useEffect(() => { mounted.current = true }, [])

    const content = (
        <>
            {/* Subtle radial backdrop */}
            <motion.div
                className="fixed inset-0 z-[99994] pointer-events-none"
                variants={backdropVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                <div
                    className="absolute pointer-events-none"
                    style={{
                        left: origin.x - 200,
                        top: origin.y - 200,
                        width: 400,
                        height: 400,
                        background: 'radial-gradient(circle, rgba(124,58,237,0.08) 0%, transparent 70%)',
                        borderRadius: '50%',
                    }}
                />
            </motion.div>

            {/* SVG connector lines */}
            <RadialLines segments={segments} origin={origin} />

            {/* Center dot */}
            <motion.div
                className="fixed z-[99998] pointer-events-none"
                style={{ left: origin.x, top: origin.y }}
                variants={centerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-violet-500/80 shadow-lg shadow-violet-500/50 blur-[1px]" />
                <div className="absolute -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/90" />
            </motion.div>

            {/* Segments container — anchored at origin */}
            <motion.div
                className="fixed z-[99997] pointer-events-none"
                style={{ left: origin.x, top: origin.y }}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
            >
                {segments.map((seg, i) => {
                    const pos = getSegmentPosition(i, segments.length, RADIAL_RADIUS)
                    return (
                        <div key={seg.id} className="pointer-events-auto">
                            <RadialSegmentItem
                                segment={seg}
                                position={pos}
                                isHovered={hoveredIndex === i}
                                onClick={() => onSelect(i)}
                            />
                        </div>
                    )
                })}

                {/* Config shortcut hint — bottom of origin */}
                <motion.div
                    className="absolute pointer-events-auto"
                    style={{ left: 0, top: RADIAL_RADIUS + 60 }}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 0.5, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: 0.3, duration: 0.2 }}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); onOpenConfig() }}
                        className="-translate-x-1/2 flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <Settings className="w-3 h-3" />
                        <span>Ctrl+Shift+K</span>
                    </button>
                </motion.div>
            </motion.div>
        </>
    )

    if (typeof document === 'undefined') return null
    return createPortal(content, document.body)
}
