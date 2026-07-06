// [Review module P4.4] The SVG annotation surface (PRD FR-E05, DATA-MODEL §6).
// Chosen over Konva because DATA-MODEL §6 sanctions "SVG/Konva" and react-konva's
// canvas reconciler is risky on React 19 (see IMPLEMENTATION-NOTES) — SVG needs no
// extra dep and renders crisply at any size.
//
// Coordinate system: the overlay fills the stage; we compute the letterboxed CONTENT
// box (object-fit: contain) and place ONE <svg> exactly over it. Inside, a
// 1000-unit-wide viewBox (height matched to aspect) means `strokeWidth={size}` maps
// 1:1 to the annotation size unit and a normalized point (nx,ny) → (nx·1000, ny·VBH).
// Shapes are stored normalized 0..1 so they survive resize / fullscreen / re-render.
//
// `editable`: pointer events on; strokes commit on pointer-up via onCommitShape.
// Read-only: pointer-events-none so the click-to-play toggle underneath still works.

'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AnnotationShape, AnnotationColor } from '@/lib/review/annotation'
import type { AnnotationTool } from './useAnnotation'
import { arrowHeadPoints, clamp01, containedBox, viewBoxHeight, type ContentBox } from './annotation-geometry'

const VBW = 1000 // viewBox width in units
const MIN_DRAG = 0.006 // ignore accidental micro-drags (normalized)
const PEN_MIN_STEP = 0.004 // thin the pen point stream (respect MAX_POINTS_PER_SHAPE)
const PEN_MAX_POINTS = 2000

type Pt = [number, number]

/** Render one stored shape into the 1000×VBH viewBox. */
function renderShape(s: AnnotationShape, vbh: number, key: string) {
    const X = (nx: number) => nx * VBW
    const Y = (ny: number) => ny * vbh
    const common = {
        stroke: s.color,
        strokeWidth: s.size,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        fill: 'none',
    }
    switch (s.tool) {
        case 'pen': {
            if (s.points.length < 2) return null
            const d = s.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${X(x).toFixed(2)} ${Y(y).toFixed(2)}`).join(' ')
            return <path key={key} d={d} {...common} />
        }
        case 'line':
            return <line key={key} x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} {...common} />
        case 'arrow': {
            const head = arrowHeadPoints(X(s.x1), Y(s.y1), X(s.x2), Y(s.y2), s.size)
            return (
                <g key={key}>
                    <line x1={X(s.x1)} y1={Y(s.y1)} x2={X(s.x2)} y2={Y(s.y2)} {...common} />
                    <polygon points={head} fill={s.color} stroke="none" />
                </g>
            )
        }
        case 'rect':
            return <rect key={key} x={X(s.x)} y={Y(s.y)} width={X(s.w)} height={Y(s.h)} rx={2} {...common} />
        default:
            return null
    }
}

export function AnnotationCanvas({
    editable,
    shapes,
    tool,
    color,
    size,
    intrinsicWidth,
    intrinsicHeight,
    onCommitShape,
}: {
    editable: boolean
    shapes: AnnotationShape[]
    tool: AnnotationTool
    color: AnnotationColor
    size: number
    intrinsicWidth: number | null
    intrinsicHeight: number | null
    onCommitShape: (s: AnnotationShape) => void
}) {
    const rootRef = useRef<HTMLDivElement>(null)
    const [rootSize, setRootSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })
    const [draft, setDraft] = useState<{ start: Pt; cur: Pt; points: Pt[] } | null>(null)
    const drawingRef = useRef(false)

    // Track the stage size so the content box recomputes on resize / fullscreen.
    useLayoutEffect(() => {
        const el = rootRef.current
        if (!el) return
        const update = () => setRootSize({ w: el.clientWidth, h: el.clientHeight })
        update()
        const ro = new ResizeObserver(update)
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const box: ContentBox | null =
        intrinsicWidth && intrinsicHeight
            ? containedBox(rootSize.w, rootSize.h, intrinsicWidth, intrinsicHeight)
            : null

    // Abandon any half-drawn stroke if we leave edit mode.
    useEffect(() => {
        if (!editable) {
            drawingRef.current = false
            setDraft(null)
        }
    }, [editable])

    const svgRef = useRef<SVGSVGElement>(null)
    const eventToNorm = useCallback((clientX: number, clientY: number): Pt => {
        const el = svgRef.current
        if (!el) return [0, 0]
        const r = el.getBoundingClientRect()
        return [clamp01((clientX - r.left) / (r.width || 1)), clamp01((clientY - r.top) / (r.height || 1))]
    }, [])

    const onPointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!editable || !box) return
            e.preventDefault()
            ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
            const p = eventToNorm(e.clientX, e.clientY)
            drawingRef.current = true
            setDraft({ start: p, cur: p, points: [p] })
        },
        [editable, box, eventToNorm],
    )

    const onPointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!drawingRef.current) return
            const p = eventToNorm(e.clientX, e.clientY)
            setDraft((d) => {
                if (!d) return d
                if (tool === 'pen') {
                    const last = d.points[d.points.length - 1]
                    const moved = Math.hypot(p[0] - last[0], p[1] - last[1])
                    if (moved < PEN_MIN_STEP || d.points.length >= PEN_MAX_POINTS) return { ...d, cur: p }
                    return { ...d, cur: p, points: [...d.points, p] }
                }
                return { ...d, cur: p }
            })
        },
        [tool, eventToNorm],
    )

    const finish = useCallback(
        (e: React.PointerEvent) => {
            if (!drawingRef.current) return
            drawingRef.current = false
            const d = draft
            setDraft(null)
            try {
                ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
            } catch {
                /* ignore */
            }
            if (!d) return
            const shape = buildShape(tool, color, size, d)
            if (shape) onCommitShape(shape)
        },
        [draft, tool, color, size, onCommitShape],
    )

    if (!box) return null
    const vbh = viewBoxHeight(box)

    return (
        // The container never intercepts clicks; only the editable SVG does, so the
        // click-to-play toggle underneath keeps working in read-only view.
        <div ref={rootRef} className="pointer-events-none absolute inset-0">
            <svg
                ref={svgRef}
                viewBox={`0 0 ${VBW} ${vbh}`}
                preserveAspectRatio="none"
                className={editable ? 'pointer-events-auto absolute touch-none cursor-crosshair' : 'pointer-events-none absolute'}
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finish}
                onPointerCancel={finish}
            >
                {shapes.map((s, i) => renderShape(s, vbh, `s${i}`))}
                {draft && renderDraft(tool, color, size, draft, vbh)}
            </svg>
        </div>
    )
}

/** The live in-progress stroke (mirrors renderShape but from the draft state). */
function renderDraft(tool: AnnotationTool, color: AnnotationColor, size: number, d: { start: Pt; cur: Pt; points: Pt[] }, vbh: number) {
    const shape = buildShape(tool, color, size, d, /* previewMinDrag */ 0)
    if (!shape) {
        // pen with a single point → a dot so the user sees the pen is live
        if (tool === 'pen') {
            const [x, y] = d.start
            return <circle cx={x * VBW} cy={y * vbh} r={size / 2} fill={color} />
        }
        return null
    }
    return renderShape(shape, vbh, 'draft')
}

/** Turn a finished/previewed draft into a normalized AnnotationShape (or null if degenerate). */
function buildShape(
    tool: AnnotationTool,
    color: AnnotationColor,
    size: number,
    d: { start: Pt; cur: Pt; points: Pt[] },
    previewMinDrag = MIN_DRAG,
): AnnotationShape | null {
    const [sx, sy] = d.start
    const [ex, ey] = d.cur
    if (tool === 'pen') {
        if (d.points.length < 2) return null
        return { tool: 'pen', color, size, points: d.points.map(([x, y]) => [x, y]) as Pt[] }
    }
    const dist = Math.hypot(ex - sx, ey - sy)
    if (dist < previewMinDrag) return null
    if (tool === 'line') return { tool: 'line', color, size, x1: sx, y1: sy, x2: ex, y2: ey }
    if (tool === 'arrow') return { tool: 'arrow', color, size, x1: sx, y1: sy, x2: ex, y2: ey }
    // rect — normalize so w/h are always positive (schema requires 0..1, min 0). Reject a
    // degenerate rect where EITHER axis is ~0 (e.g. an edge-pinned axis-aligned drag where
    // clamp01 collapses a side to 0/1) — it would store + count but render invisibly
    // (SVG omits a zero-width/height rect). A near-flat rect is a line → use the line tool.
    const w = Math.abs(ex - sx)
    const h = Math.abs(ey - sy)
    if (w < previewMinDrag || h < previewMinDrag) return null
    return { tool: 'rect', color, size, x: Math.min(sx, ex), y: Math.min(sy, ey), w, h }
}
