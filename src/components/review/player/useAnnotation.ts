// [Review module P4.4] Shell-level annotation draw state (PRD FR-E05). The player
// shell owns this because BOTH the overlay (VideoStage slot) and the composer
// (CommentsPanel) read from it: the overlay draws + renders committed shapes, the
// composer submits them with createComment. In-progress strokes live inside the
// canvas and only COMMIT here on pointer-up, so dragging never re-renders the shell.
//
// Undo/redo is a pre-submit client concern only (DATA-MODEL §6): the DB stores just
// the final shape list. `frame` pins the annotation to the frozen playhead so the
// comment's startFrame and its drawing always agree.

'use client'

import { useCallback, useMemo, useState } from 'react'
import { ANNOTATION_COLORS, MAX_SHAPES, type AnnotationShape, type AnnotationColor } from '@/lib/review/annotation'

export type AnnotationTool = 'pen' | 'line' | 'arrow' | 'rect'

/** Stroke widths in 1/1000-of-width units (see annotation.ts `size`). */
export const ANNOTATION_SIZES = { small: 3, medium: 6, large: 12 } as const
export type AnnotationSizeKey = keyof typeof ANNOTATION_SIZES

export interface AnnotationController {
    active: boolean
    tool: AnnotationTool
    color: AnnotationColor
    sizeKey: AnnotationSizeKey
    size: number
    shapes: AnnotationShape[]
    canUndo: boolean
    canRedo: boolean
    /** frame the drawing is pinned to (frozen when drawing began); null until begun. */
    frame: number | null
    setTool: (t: AnnotationTool) => void
    setColor: (c: AnnotationColor) => void
    setSizeKey: (k: AnnotationSizeKey) => void
    /** Enter draw mode pinned to `frame`. Keeps any shapes already present. */
    begin: (frame: number) => void
    addShape: (s: AnnotationShape) => void
    undo: () => void
    redo: () => void
    clear: () => void
    /** Leave draw mode AND wipe everything (used after posting / on cancel). */
    reset: () => void
}

export function useAnnotation(): AnnotationController {
    const [active, setActive] = useState(false)
    const [tool, setTool] = useState<AnnotationTool>('pen')
    const [color, setColor] = useState<AnnotationColor>(ANNOTATION_COLORS.red)
    const [sizeKey, setSizeKey] = useState<AnnotationSizeKey>('medium')
    const [shapes, setShapes] = useState<AnnotationShape[]>([])
    const [redoStack, setRedoStack] = useState<AnnotationShape[]>([])
    const [frame, setFrame] = useState<number | null>(null)

    const begin = useCallback((f: number) => {
        setFrame(f)
        setActive(true)
    }, [])

    const addShape = useCallback((s: AnnotationShape) => {
        setShapes((prev) => (prev.length >= MAX_SHAPES ? prev : [...prev, s]))
        setRedoStack([]) // a new stroke invalidates the redo branch
    }, [])

    const undo = useCallback(() => {
        setShapes((prev) => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            setRedoStack((r) => [...r, last])
            return prev.slice(0, -1)
        })
    }, [])

    const redo = useCallback(() => {
        setRedoStack((r) => {
            if (r.length === 0) return r
            const last = r[r.length - 1]
            setShapes((prev) => (prev.length >= MAX_SHAPES ? prev : [...prev, last]))
            return r.slice(0, -1)
        })
    }, [])

    const clear = useCallback(() => {
        setShapes([])
        setRedoStack([])
    }, [])

    const reset = useCallback(() => {
        setActive(false)
        setShapes([])
        setRedoStack([])
        setFrame(null)
    }, [])

    return useMemo(
        () => ({
            active,
            tool,
            color,
            sizeKey,
            size: ANNOTATION_SIZES[sizeKey],
            shapes,
            canUndo: shapes.length > 0,
            canRedo: redoStack.length > 0,
            frame,
            setTool,
            setColor,
            setSizeKey,
            begin,
            addShape,
            undo,
            redo,
            clear,
            reset,
        }),
        [active, tool, color, sizeKey, shapes, redoStack.length, frame, begin, addShape, undo, redo, clear, reset],
    )
}
