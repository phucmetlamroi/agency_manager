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

    // Only allow gesture on genuinely empty background area.
    const isEmptySpace = useCallback((e: MouseEvent): boolean => {
        const target = e.target
        if (!(target instanceof Element)) return false

        if (target.closest('[data-radial-trigger]')) return true
        if (target.closest('[data-radial-ignore]')) return false

        const BLOCKING_SELECTOR = [
            'button',
            'a',
            'input',
            'textarea',
            'select',
            'label',
            'summary',
            'iframe',
            'canvas',
            'video',
            'audio',
            'table',
            'th',
            'td',
            'tr',
            'form',
            '[role]',
            '[contenteditable=""]',
            '[contenteditable="true"]',
            '[tabindex]:not([tabindex="-1"])',
            '[draggable="true"]',
            '[aria-haspopup]',
            '[aria-controls]',
            '[aria-expanded]',
            '[data-state]',
            '[data-slot]',
            '[data-radix-popper-content-wrapper]',
            '[data-radix-menu-content]',
            '[data-radix-dialog-content]',
            '[data-radix-select-content]',
            '[onclick]',
        ].join(', ')

        if (target.closest(BLOCKING_SELECTOR)) return false

        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY)
        for (const el of elementsAtPoint) {
            if (!(el instanceof HTMLElement)) continue
            if (el.closest('[data-radial-trigger]')) return true
            if (el.matches('html, body')) continue
            if (el.matches(BLOCKING_SELECTOR)) return false

            const style = window.getComputedStyle(el)
            if (style.pointerEvents === 'none' || style.visibility === 'hidden' || style.display === 'none') {
                continue
            }

            const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent'
            const hasBorder =
                (parseFloat(style.borderTopWidth) > 0 ||
                    parseFloat(style.borderRightWidth) > 0 ||
                    parseFloat(style.borderBottomWidth) > 0 ||
                    parseFloat(style.borderLeftWidth) > 0) &&
                style.borderColor !== 'transparent'
            const hasShadow = style.boxShadow !== 'none'

            if (hasBackground || hasBorder || hasShadow) {
                return false
            }
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
            if (!isEmptySpace(e)) return

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
