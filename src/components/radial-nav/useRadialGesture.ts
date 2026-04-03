'use client'

import { useEffect, useRef, useCallback } from 'react'
import { DRAG_THRESHOLD } from './radial-nav.constants'
import type { GestureState } from './radial-nav.types'

type UseRadialGestureOptions = {
    onOpen: (origin: { x: number; y: number }) => void
    onClose: () => void
    onHover: (segmentIndex: number | null) => void
    onSelect: (segmentIndex: number) => void
    segmentCount: number
    disabled?: boolean
}

/**
 * Detects Ctrl + MouseDown + Drag gesture to trigger radial menu.
 *
 * State Machine:
 *   IDLE --[Ctrl+mousedown on empty space]--> ARMED
 *   ARMED --[mousemove > threshold]--> MENU_OPEN
 *   ARMED --[mouseup < threshold]--> IDLE  (was just a click)
 *   MENU_OPEN --[mouseup on segment]--> onSelect -> IDLE
 *   MENU_OPEN --[mouseup on nothing | Escape | Ctrl release]--> IDLE
 */
export function useRadialGesture({
    onOpen,
    onClose,
    onHover,
    onSelect,
    segmentCount,
    disabled = false,
}: UseRadialGestureOptions) {
    const gestureState = useRef<GestureState>('IDLE')
    const origin = useRef<{ x: number; y: number } | null>(null)
    const currentHover = useRef<number | null>(null)

    // Compute which segment index the mouse is pointing at from the origin
    const getSegmentIndex = useCallback(
        (mx: number, my: number): number | null => {
            if (!origin.current) return null
            const dx = mx - origin.current.x
            const dy = my - origin.current.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            // Dead zone near center
            if (dist < 45) return null

            // atan2 returns [-PI, PI], 0 = right, -PI/2 = up
            const angle = Math.atan2(dy, dx)
            // Shift so 0 = top (12 o'clock), increases clockwise
            const normalized = ((angle + Math.PI * 2.5) % (Math.PI * 2))
            const index = Math.floor(normalized / ((Math.PI * 2) / segmentCount))
            return Math.min(index, segmentCount - 1)
        },
        [segmentCount]
    )

    // Check if the event target is "empty space" (not an interactive element)
    const isEmptySpace = useCallback((target: EventTarget | null): boolean => {
        if (!(target instanceof Element)) return false
        const INTERACTIVE = ['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'LABEL']
        let el: Element | null = target
        while (el) {
            if (INTERACTIVE.includes(el.tagName)) return false
            if (el.getAttribute('role') === 'button') return false
            if (el.getAttribute('data-radial-ignore') !== null) return false
            if (el.getAttribute('data-radial-trigger') !== null) return true // explicit allow
            el = el.parentElement
        }
        return true
    }, [])

    const reset = useCallback(() => {
        gestureState.current = 'IDLE'
        origin.current = null
        currentHover.current = null
    }, [])

    const close = useCallback(() => {
        reset()
        onClose()
        onHover(null)
    }, [reset, onClose, onHover])

    useEffect(() => {
        if (disabled) {
            close()
            return
        }

        const handleMouseDown = (e: MouseEvent) => {
            // Only left-click, Ctrl held, not Shift (Shift+Ctrl+K is config modal)
            if (e.button !== 0) return
            if (!e.ctrlKey) return
            if (e.shiftKey) return
            if (!isEmptySpace(e.target)) return

            gestureState.current = 'ARMED'
            origin.current = { x: e.clientX, y: e.clientY }
            // Prevent text selection during drag
            e.preventDefault()
        }

        const handleMouseMove = (e: MouseEvent) => {
            if (gestureState.current === 'ARMED') {
                if (!origin.current) return
                const dx = e.clientX - origin.current.x
                const dy = e.clientY - origin.current.y
                const dist = Math.sqrt(dx * dx + dy * dy)

                if (dist > DRAG_THRESHOLD) {
                    gestureState.current = 'MENU_OPEN'
                    onOpen({ x: origin.current.x, y: origin.current.y })
                }
                return
            }

            if (gestureState.current === 'MENU_OPEN') {
                const idx = getSegmentIndex(e.clientX, e.clientY)
                if (idx !== currentHover.current) {
                    currentHover.current = idx
                    onHover(idx)
                }
            }
        }

        const handleMouseUp = (e: MouseEvent) => {
            if (gestureState.current === 'MENU_OPEN') {
                const idx = getSegmentIndex(e.clientX, e.clientY)
                if (idx !== null) {
                    onSelect(idx)
                }
                close()
                return
            }
            if (gestureState.current === 'ARMED') {
                reset()
            }
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && gestureState.current === 'MENU_OPEN') {
                close()
            }
        }

        const handleKeyUp = (e: KeyboardEvent) => {
            // Close if Ctrl is released while menu is open
            if (e.key === 'Control' && gestureState.current === 'MENU_OPEN') {
                close()
            }
            if (e.key === 'Control' && gestureState.current === 'ARMED') {
                reset()
            }
        }

        document.addEventListener('mousedown', handleMouseDown)
        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('keyup', handleKeyUp)

        return () => {
            document.removeEventListener('mousedown', handleMouseDown)
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('keyup', handleKeyUp)
        }
    }, [disabled, isEmptySpace, getSegmentIndex, onOpen, onSelect, close, reset, onHover])
}
