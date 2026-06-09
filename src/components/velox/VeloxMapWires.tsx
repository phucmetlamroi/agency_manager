'use client'

/**
 * [Velox v4 — Fan-out wires SVG]
 *
 * Draws Bezier curves connecting Hook → Body and Body → CTA inside a
 * concept lane. Receives source/target DOM rects (relative to a shared
 * container) and emits an SVG overlay that sits behind the node cards.
 *
 * The component is layout-aware via a ResizeObserver — when the parent
 * resizes (window, accordion expand, drag rearrange in P4), the wires
 * reflow without re-measuring on every paint.
 */

import { useEffect, useRef, useState } from 'react'
import type { VeloxEdge } from '@/lib/velox/v4-types'
import { WIRE_COLOR } from './velox-map-style'

export interface VeloxMapWiresProps {
    /** Edges to draw — from-node id → to-node id. */
    edges: VeloxEdge[]
    /** Refs to each node's DOM container, keyed by node id. */
    nodeRefs: Map<string, HTMLElement | null>
    /** The parent container whose coordinate space the SVG matches. */
    containerRef: React.RefObject<HTMLDivElement | null>
    /** Optional set of node ids that should render their incoming/outgoing
     *  wires muted (excluded / superseded). */
    mutedNodeIds?: Set<string>
}

interface Path {
    d: string
    stroke: string
    opacity: number
    key: string
}

export default function VeloxMapWires({
    edges,
    nodeRefs,
    containerRef,
    mutedNodeIds,
}: VeloxMapWiresProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const [paths, setPaths] = useState<Path[]>([])
    const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const recompute = () => {
            const cRect = container.getBoundingClientRect()
            setSize({ w: cRect.width, h: cRect.height })

            const next: Path[] = []
            for (let i = 0; i < edges.length; i++) {
                const e = edges[i]
                const fromEl = nodeRefs.get(e.from)
                const toEl = nodeRefs.get(e.to)
                if (!fromEl || !toEl) continue
                const f = fromEl.getBoundingClientRect()
                const t = toEl.getBoundingClientRect()
                const x1 = f.right - cRect.left
                const y1 = f.top - cRect.top + f.height / 2
                const x2 = t.left - cRect.left
                const y2 = t.top - cRect.top + t.height / 2
                const midX = (x1 + x2) / 2
                const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${midX.toFixed(1)} ${y1.toFixed(1)}, ${midX.toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`
                const isToCta = toEl.dataset.veloxRole === 'CTA'
                const muted = !!mutedNodeIds?.has(e.from) || !!mutedNodeIds?.has(e.to)
                next.push({
                    d,
                    stroke: muted ? WIRE_COLOR.muted : isToCta ? WIRE_COLOR.body : WIRE_COLOR.hook,
                    opacity: muted ? 0.5 : 1,
                    key: `${e.from}->${e.to}-${i}`,
                })
            }
            setPaths(next)
        }

        recompute()
        const ro = new ResizeObserver(recompute)
        ro.observe(container)
        // Re-measure when fonts settle / images load — cheap safety net.
        const t = setTimeout(recompute, 60)
        window.addEventListener('resize', recompute)
        return () => {
            ro.disconnect()
            clearTimeout(t)
            window.removeEventListener('resize', recompute)
        }
    }, [edges, nodeRefs, containerRef, mutedNodeIds])

    if (size.w === 0) {
        return null
    }

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ width: size.w, height: size.h }}
            aria-hidden="true"
        >
            <defs>
                <filter id="velox-wire-glow" x="-10%" y="-10%" width="120%" height="120%">
                    <feGaussianBlur stdDeviation="1.2" result="b" />
                    <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>
            </defs>
            {paths.map((p) => (
                <path
                    key={p.key}
                    d={p.d}
                    stroke={p.stroke}
                    strokeWidth={1.6}
                    fill="none"
                    strokeLinecap="round"
                    opacity={p.opacity}
                    filter="url(#velox-wire-glow)"
                />
            ))}
        </svg>
    )
}
