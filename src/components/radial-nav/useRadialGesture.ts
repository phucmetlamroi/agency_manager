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

    // Only allow gesture on genuinely empty background area (The "Void").
    const isEmptySpace = useCallback((e: MouseEvent): boolean => {
        const target = e.target
        if (!(target instanceof Element)) return false

        // 1. Explicit triggers/ignores
        if (target.closest('[data-radial-trigger]')) return true
        if (target.closest('[data-radial-ignore]')) return false

        // 2. Component Shells & Information Containers
        // As confirmed by user, Sidebar, Cards, and Forms are "Information Areas".
        const COMPONENT_SELECTOR = [
            '.glass-panel',
            '.card',
            'aside',
            'nav',
            'form',
            'header',
            'footer',
            '[role="dialog"]',
            '[role="menu"]',
            '[role="listbox"]'
        ].join(', ')

        if (target.closest(COMPONENT_SELECTOR)) return false

        // 3. Interactive Element Registry
        const BLOCKING_SELECTOR = [
            'button',
            'a',
            'input',
            'textarea',
            'select',
            'label',
            'summary',
            'iframe',
            'table',
            'th',
            'td',
            'tr',
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

        // 4. Trace the element stack at the click point
        const elementsAtPoint = document.elementsFromPoint(e.clientX, e.clientY)
        for (const el of elementsAtPoint) {
            if (!(el instanceof HTMLElement)) continue
            
            // Layout markers: html/body are the base "Void"
            if (el.matches('html, body')) continue
            
            // Block on any interactive or component level
            if (el.matches(BLOCKING_SELECTOR) || el.matches(COMPONENT_SELECTOR)) return false

            // Block on information-rich tags
            if (el.tagName === 'IMG' || el.tagName === 'SVG' || el.tagName === 'CANVAS' || el.tagName === 'H1' || el.tagName === 'H2' || el.tagName === 'H3') {
                return false
            }

            const style = window.getComputedStyle(el)
            
            // Skip transparent layout wrappers
            if (style.pointerEvents === 'none' || style.visibility === 'hidden' || style.display === 'none') {
                continue
            }

            // High priority: if it looks like it does something, it's not a void.
            if (style.cursor === 'pointer') return false

            // Visual Check: Cards vs Layout
            // If it has background/border/shadow, check if it's a "Component" vs "Layout Wrapper"
            const hasVisuals = 
                (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
                (parseFloat(style.borderWidth) > 0 && style.borderColor !== 'transparent') ||
                (style.boxShadow !== 'none')

            if (hasVisuals) {
                const rect = el.getBoundingClientRect()
                const viewportArea = window.innerWidth * window.innerHeight
                const elementArea = rect.width * rect.height
                
                // If the element covers more than 60% of the screen, it's likely a background Layout Wrapper
                // Smaller than that with visuals = It's a "Component" (Information area)
                if (elementArea < viewportArea * 0.6) {
                    return false
                }
            }

            // Block if it contains direct text nodes (Information)
            const hasTextContent = Array.from(el.childNodes).some(
                node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== ''
            )
            if (hasTextContent) return false
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
