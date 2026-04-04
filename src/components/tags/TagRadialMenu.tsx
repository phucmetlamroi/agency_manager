'use client'

import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

type TagItem = { id: string; name: string }

interface TagRadialMenuProps {
    isOpen: boolean
    origin: { x: number; y: number }
    tags: TagItem[]
    selectedTagIds: string[]
    onToggle: (tagId: string) => void
    onClose: () => void
}

const RADIUS = 110
const MIN_SLOTS = 6

function getSegmentPosition(index: number, total: number) {
    const angleRad = (2 * Math.PI * index) / total - Math.PI / 2
    return {
        x: Math.cos(angleRad) * RADIUS,
        y: Math.sin(angleRad) * RADIUS,
    }
}

export function TagRadialMenu({ isOpen, origin, tags, selectedTagIds, onToggle, onClose }: TagRadialMenuProps) {
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    if (!mounted) return null

    const totalSlots = Math.max(MIN_SLOTS, tags.length)
    const slots: (TagItem | null)[] = Array.from({ length: totalSlots }, (_, i) => tags[i] || null)

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.12 }}
                        className="fixed inset-0 z-[9998] bg-black/30 backdrop-blur-[2px]"
                        onClick={onClose}
                    />

                    {/* Radial container */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed z-[9999] pointer-events-none"
                        style={{ left: origin.x, top: origin.y }}
                    >
                        {/* Center dot */}
                        <motion.div
                            animate={{ scale: [1, 1.3, 1] }}
                            transition={{ repeat: Infinity, duration: 2 }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-indigo-400 shadow-lg shadow-indigo-500/40"
                        />

                        {/* SVG connector lines */}
                        <svg
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            width={RADIUS * 2 + 80}
                            height={RADIUS * 2 + 80}
                            style={{ left: -(RADIUS + 40), top: -(RADIUS + 40) }}
                        >
                            {slots.map((_, i) => {
                                const pos = getSegmentPosition(i, totalSlots)
                                return (
                                    <motion.line
                                        key={i}
                                        x1={RADIUS + 40}
                                        y1={RADIUS + 40}
                                        x2={RADIUS + 40 + pos.x}
                                        y2={RADIUS + 40 + pos.y}
                                        stroke="rgba(255,255,255,0.06)"
                                        strokeWidth={1}
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ delay: i * 0.04, duration: 0.2 }}
                                    />
                                )
                            })}
                        </svg>

                        {/* Segments */}
                        {slots.map((tag, i) => {
                            const pos = getSegmentPosition(i, totalSlots)
                            const isSelected = tag ? selectedTagIds.includes(tag.id) : false
                            const hasTag = !!tag

                            return (
                                <motion.button
                                    key={i}
                                    initial={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
                                    animate={{
                                        opacity: 1,
                                        scale: isSelected ? 1.1 : 1,
                                        x: pos.x,
                                        y: pos.y,
                                    }}
                                    exit={{ opacity: 0, scale: 0.2, x: 0, y: 0 }}
                                    transition={{
                                        type: 'spring',
                                        stiffness: 300,
                                        damping: 25,
                                        delay: i * 0.04
                                    }}
                                    onClick={() => tag && onToggle(tag.id)}
                                    disabled={!hasTag}
                                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-[72px] h-[72px] rounded-full flex items-center justify-center pointer-events-auto border-2 transition-all cursor-pointer
                                        ${isSelected
                                            ? 'bg-indigo-500/30 border-indigo-400 shadow-lg shadow-indigo-500/25'
                                            : hasTag
                                                ? 'bg-zinc-900/70 border-white/10 hover:border-white/25 hover:bg-zinc-800/70'
                                                : 'bg-zinc-900/30 border-white/5 cursor-default'
                                        }`}
                                >
                                    <span className={`text-[10px] font-bold text-center leading-tight px-1 ${
                                        isSelected ? 'text-indigo-200' : hasTag ? 'text-zinc-200' : 'text-zinc-600'
                                    }`}>
                                        {tag?.name || 'None'}
                                    </span>
                                </motion.button>
                            )
                        })}
                    </motion.div>
                </>
            )}
        </AnimatePresence>,
        document.body
    )
}
