'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

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
const ANIM_MS = 180
// Spring-like cubic-bezier with slight overshoot for "pop" feel
const SPRING_EASE = 'cubic-bezier(0.34, 1.56, 0.64, 1)'

export function TagRadialMenu({ isOpen, origin, tags, selectedTagIds, onToggle, onClose }: TagRadialMenuProps) {
    const [mounted, setMounted] = useState(false)
    const [shouldRender, setShouldRender] = useState(false)
    const [visible, setVisible] = useState(false)
    const [hoveredTagId, setHoveredTagId] = useState<string | null>(null)
    
    const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
    const rafRef = useRef<number>(0)
    const justSelectedRef = useRef(false)
    const hoveredTagIdRef = useRef<string | null>(null)

    // Sync ref with state for immediate access in event listeners
    useEffect(() => {
        hoveredTagIdRef.current = hoveredTagId
    }, [hoveredTagId])

    // SSR safety
    useEffect(() => { setMounted(true) }, [])

    // ── Enter/Exit state machine ──
    useEffect(() => {
        cancelAnimationFrame(rafRef.current)

        if (isOpen) {
            setShouldRender(true)
            justSelectedRef.current = false
            setHoveredTagId(null)
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = requestAnimationFrame(() => {
                    setVisible(true)
                })
            })
            return () => cancelAnimationFrame(rafRef.current)
        } else {
            setVisible(false)
            setHoveredTagId(null)
            const timer = setTimeout(() => {
                setShouldRender(false)
                justSelectedRef.current = false
            }, ANIM_MS + 50)
            return () => clearTimeout(timer)
        }
    }, [isOpen])

    // ── Tag selection → toggle + auto-close with visual feedback ──
    const handleSelect = useCallback((tagId: string) => {
        if (justSelectedRef.current) return
        
        justSelectedRef.current = true
        onToggle(tagId)
        
        clearTimeout(closeTimerRef.current)
        // Delay closing slightly to provide visual feedback of the selection
        closeTimerRef.current = setTimeout(() => {
            onClose()
            justSelectedRef.current = false
        }, ANIM_MS)
    }, [onToggle, onClose])

    // ── Global mouseup → Selection or Close ──
    // This allows selecting a tag by releasing the drag over a petal
    useEffect(() => {
        if (!isOpen) return

        const handleMouseUp = () => {
            if (justSelectedRef.current) return
            
            const activeId = hoveredTagIdRef.current
            if (activeId) {
                handleSelect(activeId)
            } else {
                onClose()
            }
        }

        const attachTimer = setTimeout(() => {
            document.addEventListener('mouseup', handleMouseUp, { passive: true })
        }, 150)

        return () => {
            clearTimeout(attachTimer)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [isOpen, onClose, handleSelect])

    // ── Escape → close ──
    useEffect(() => {
        if (!isOpen) return
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [isOpen, onClose])

    // ── Master cleanup ──
    useEffect(() => {
        return () => {
            clearTimeout(closeTimerRef.current)
            cancelAnimationFrame(rafRef.current)
        }
    }, [])

    if (!mounted || !shouldRender) return null

    const totalSlots = Math.max(MIN_SLOTS, tags.length)
    const slots: (TagItem | null)[] = Array.from({ length: totalSlots }, (_, i) => tags[i] || null)

    return createPortal(
        <>
            {/* ── Backdrop (CSS transition, no Framer Motion) ── */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9998,
                    backgroundColor: visible ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0)',
                    backdropFilter: visible ? 'blur(2px)' : 'blur(0px)',
                    WebkitBackdropFilter: visible ? 'blur(2px)' : 'blur(0px)',
                    transition: `background-color ${ANIM_MS}ms ease, backdrop-filter ${ANIM_MS}ms ease, -webkit-backdrop-filter ${ANIM_MS}ms ease`,
                }}
            />

            {/* ── Radial container (GPU layer via translate3d + will-change) ── */}
            <div
                style={{
                    position: 'fixed',
                    zIndex: 9999,
                    left: 0,
                    top: 0,
                    transform: `translate3d(${origin.x}px, ${origin.y}px, 0)`,
                    pointerEvents: 'none',
                }}
            >
                {/* Center dot (CSS @keyframes pulse — scale + opacity only) */}
                <div
                    className="rounded-full bg-indigo-400"
                    style={{
                        position: 'absolute',
                        width: 12,
                        height: 12,
                        boxShadow: '0 0 12px rgba(99,102,241,0.5)',
                        transform: 'translate3d(-50%, -50%, 0)',
                        willChange: 'transform',
                        opacity: visible ? 1 : 0,
                        transition: `opacity ${ANIM_MS}ms ease`,
                        animation: visible ? 'radial-dot-pulse 2s ease-in-out infinite' : 'none',
                    }}
                />

                {/* SVG connector lines (stroke-dashoffset CSS animation) */}
                <svg
                    width={RADIUS * 2 + 80}
                    height={RADIUS * 2 + 80}
                    style={{
                        position: 'absolute',
                        transform: `translate3d(${-(RADIUS + 40)}px, ${-(RADIUS + 40)}px, 0)`,
                        pointerEvents: 'none',
                    }}
                >
                    {slots.map((slot, i) => {
                        const angle = (2 * Math.PI * i) / totalSlots - Math.PI / 2
                        const x = Math.cos(angle) * RADIUS
                        const y = Math.sin(angle) * RADIUS
                        const isActive = slot && (slot.id === hoveredTagId)
                        return (
                            <line
                                key={i}
                                x1={RADIUS + 40}
                                y1={RADIUS + 40}
                                x2={RADIUS + 40 + x}
                                y2={RADIUS + 40 + y}
                                stroke={isActive ? "rgba(129, 140, 248, 0.4)" : "rgba(255,255,255,0.06)"}
                                strokeWidth={isActive ? 2 : 1}
                                strokeDasharray={RADIUS}
                                strokeDashoffset={visible ? 0 : RADIUS}
                                style={{
                                    transition: `stroke-dashoffset ${ANIM_MS}ms ease ${i * 40}ms, stroke 150ms ease, stroke-width 150ms ease`,
                                }}
                            />
                        )
                    })}
                </svg>

                {/* ── Petal buttons (GPU-accelerated CSS transitions) ── */}
                {slots.map((tag, i) => {
                    const angle = (2 * Math.PI * i) / totalSlots - Math.PI / 2
                    const x = Math.cos(angle) * RADIUS
                    const y = Math.sin(angle) * RADIUS
                    const isSelected = tag ? selectedTagIds.includes(tag.id) : false
                    const isHovered = tag ? (tag.id === hoveredTagId) : false
                    const hasTag = !!tag

                    return (
                        <button
                            key={i}
                            data-radial-petal
                            disabled={!hasTag}
                            onMouseEnter={() => tag && setHoveredTagId(tag.id)}
                            onMouseLeave={() => setHoveredTagId(null)}
                            onMouseUp={(e) => {
                                // Manual trigger on mouseup to ensure it fires before global handler
                                e.stopPropagation()
                                if (tag) handleSelect(tag.id)
                            }}
                            className={[
                                'absolute flex items-center justify-center rounded-full border-2 radial-petal-hitbox',
                                isSelected
                                    ? 'bg-indigo-500/40 border-indigo-400 shadow-lg shadow-indigo-500/40'
                                    : isHovered
                                        ? 'bg-indigo-500/20 border-indigo-400/50 shadow-md shadow-indigo-500/10'
                                        : hasTag
                                            ? 'bg-zinc-900/70 border-white/10 hover:border-white/25 hover:bg-zinc-800/70'
                                            : 'bg-zinc-900/30 border-white/5 cursor-default',
                            ].join(' ')}
                            style={{
                                width: 72,
                                height: 72,
                                pointerEvents: hasTag ? 'auto' : 'none',
                                cursor: hasTag ? 'pointer' : 'default',
                                transform: visible
                                    ? `translate3d(calc(${x}px - 50%), calc(${y}px - 50%), 0) scale(${isSelected || isHovered ? 1.15 : 1})`
                                    : 'translate3d(-50%, -50%, 0) scale(0.2)',
                                opacity: visible ? 1 : 0,
                                transition: [
                                    `transform ${ANIM_MS}ms ${SPRING_EASE} ${i * 40}ms`,
                                    `opacity ${ANIM_MS}ms ease ${i * 40}ms`,
                                    'border-color 150ms ease',
                                    'background-color 150ms ease',
                                    'box-shadow 150ms ease',
                                ].join(', '),
                                willChange: 'transform, opacity',
                            }}
                        >
                            <span className={`text-[10px] font-bold text-center leading-tight px-1 transition-colors ${
                                isSelected || isHovered ? 'text-indigo-100' : hasTag ? 'text-zinc-200' : 'text-zinc-600'
                            }`}>
                                {tag?.name || 'None'}
                            </span>
                        </button>
                    )
                })}
            </div>

            {/* ── Hitbox & Keyframes Styles ── */}
            <style>{`
                @keyframes radial-dot-pulse {
                    0%, 100% { transform: translate3d(-50%, -50%, 0) scale(1); }
                    50% { transform: translate3d(-50%, -50%, 0) scale(1.3); }
                }
                .radial-petal-hitbox::before {
                    content: '';
                    position: absolute;
                    inset: -15px; /* Expand hitbox by 15px in all directions */
                    border-radius: 50%;
                    pointer-events: auto;
                }
            `}</style>
        </>,
        document.body
    )
}
