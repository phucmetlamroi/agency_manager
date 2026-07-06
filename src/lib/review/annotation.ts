// [Review module P4.1] Annotation JSON contract (DATA-MODEL §6 + PRD FR-E05).
// A comment's drawing is a flat list of shapes with coordinates NORMALIZED 0..1
// against the ORIGINAL video frame (origin top-left), so the same annotation
// renders correctly at any player size / fullscreen / 9:16. Undo/redo is a
// client concern BEFORE submit; the DB stores only the final shape list.
//
// Server caps (anti-abuse, §6.3): ≤100 shapes, ≤2000 points/pen-shape, palette
// locked to the 4 review colours. Unknown fields inside a shape are STRIPPED
// (forward-compatible when a later phase adds a tool) rather than rejected.

import { z } from 'zod'

/** The ONLY four annotation colours (PRD FR-E05 / DATA-MODEL §6). */
export const ANNOTATION_COLORS = {
    red: '#F22237',
    green: '#16A34A',
    yellow: '#FACC15',
    orange: '#F97316',
} as const

export const ANNOTATION_PALETTE = Object.values(ANNOTATION_COLORS) as string[]

export const MAX_SHAPES = 100
export const MAX_POINTS_PER_SHAPE = 2000

const color = z.enum(['#F22237', '#16A34A', '#FACC15', '#F97316'])
const unit = z.number().min(0).max(1) // normalized coordinate
const size = z.number().min(0.5).max(100) // stroke width in 1/1000-of-width units

// Discriminated by `tool`. `.strip()` (zod default on objects) drops unknown keys.
const penShape = z.object({
    tool: z.literal('pen'),
    color,
    size,
    points: z.array(z.tuple([unit, unit])).min(2).max(MAX_POINTS_PER_SHAPE),
})
const lineShape = z.object({
    tool: z.literal('line'),
    color,
    size,
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
})
const arrowShape = z.object({
    tool: z.literal('arrow'),
    color,
    size,
    x1: unit,
    y1: unit,
    x2: unit,
    y2: unit,
})
const rectShape = z.object({
    tool: z.literal('rect'),
    color,
    size,
    x: unit,
    y: unit,
    w: unit,
    h: unit,
})

export const annotationShapeSchema = z.discriminatedUnion('tool', [penShape, lineShape, arrowShape, rectShape])
export type AnnotationShape = z.infer<typeof annotationShapeSchema>
/** One of the 4 locked review colours (the shape `color` literal union). */
export type AnnotationColor = AnnotationShape['color']

/** A shape list: 1..100 shapes. Empty list is treated as "no annotation" by the caller. */
export const annotationSchema = z.array(annotationShapeSchema).min(1).max(MAX_SHAPES)

/** DB envelope written to ReviewComment.annotation: { v:1, shapes:[...] } (DATA-MODEL §6). */
export interface AnnotationEnvelope {
    v: 1
    shapes: AnnotationShape[]
}

/** Wrap a validated shape list for storage. */
export function toAnnotationEnvelope(shapes: AnnotationShape[]): AnnotationEnvelope {
    return { v: 1, shapes }
}

/**
 * Read shapes back from a stored envelope, tolerating legacy/loose JSON. Returns
 * null when there is nothing renderable. Never throws — bad rows degrade to null
 * rather than breaking the whole comment feed.
 */
export function readAnnotationShapes(value: unknown): AnnotationShape[] | null {
    if (!value || typeof value !== 'object') return null
    const shapes = (value as { shapes?: unknown }).shapes
    if (!Array.isArray(shapes)) return null
    const parsed = annotationSchema.safeParse(shapes)
    if (!parsed.success) {
        // Best-effort: keep the shapes that individually validate (forward-compat).
        const good = shapes
            .map((s) => annotationShapeSchema.safeParse(s))
            .filter((r): r is { success: true; data: AnnotationShape } => r.success)
            .map((r) => r.data)
        return good.length ? good.slice(0, MAX_SHAPES) : null
    }
    return parsed.data
}
