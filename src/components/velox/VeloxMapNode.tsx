'use client'

/**
 * [Velox v4 — Map Node card]
 *
 * Renders ONE `VeloxNode` as a glass card matching HustlyTasker's dark
 * theme. Read-only at this layer — click handler bubbles up an open
 * intent (link or details) for the parent to handle.
 *
 * Visual taxonomy
 *   - Role accent border + chip colour from `velox-map-style`.
 *   - REVIEW band overlays an indigo inner ring.
 *   - EXCLUDED / SUPERSEDED / PENDING lay opacity + line-through +
 *     status badge so the editor sees state at a glance without
 *     interaction.
 *   - Compilation nodes surface the spec note ("File này chứa nhiều
 *     hook khác nhau — cần tách khi dựng.") underneath.
 */

import { motion } from 'framer-motion'
import { ExternalLink, Sparkles } from 'lucide-react'
import type { VeloxNode } from '@/lib/velox/v4-types'
import {
    BAND_RING,
    CARD_BASE,
    CARD_HOVER,
    CHIP_BASE,
    ROLE_ACCENT,
    STATUS_BADGE_CLASS,
    STATUS_CLASS,
    STATUS_LABEL,
} from './velox-map-style'

export interface VeloxMapNodeProps {
    node: VeloxNode
    /** Fired when the user clicks the card. Parent handles open-link logic. */
    onOpen?: (node: VeloxNode) => void
    /** Compact rendering (no parts/durations chips, just the title strip). */
    dense?: boolean
}

export default function VeloxMapNode({ node, onOpen, dense = false }: VeloxMapNodeProps) {
    const role = ROLE_ACCENT[node.role]
    const statusBadge = STATUS_LABEL[node.status]
    const partsCount = node.files.length
    const duration = node.modifiers?.durationSec
    const audience = node.modifiers?.audience

    const isInteractive = !!onOpen

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            whileHover={isInteractive ? { y: -2 } : undefined}
            className={[
                CARD_BASE,
                isInteractive && CARD_HOVER,
                role.border,
                BAND_RING[node.band],
                STATUS_CLASS[node.status],
                'group/node px-3 py-2.5 min-w-[160px] max-w-[220px]',
                isInteractive && 'cursor-pointer',
            ]
                .filter(Boolean)
                .join(' ')}
            onClick={() => onOpen?.(node)}
            data-velox-node-id={node.id}
            data-velox-role={node.role}
            data-velox-status={node.status}
        >
            {/* Top strip: role chip + label + open-link icon */}
            <div className="flex items-start gap-2">
                <div
                    className={[
                        'w-6 h-6 rounded-md grid place-items-center text-[10px] font-bold border',
                        role.chipBg,
                        role.text,
                        role.border,
                    ].join(' ')}
                    aria-hidden="true"
                >
                    {roleAbbr(node.role)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className={[
                        'text-[12.5px] font-semibold tracking-tight leading-tight truncate',
                        node.status === 'ACTIVE' ? role.text : 'text-zinc-300',
                    ].join(' ')}
                        title={node.label}
                    >
                        {capitaliseLabel(node.label)}
                    </div>
                    {/* Sub-line: confidence + scope hint */}
                    <div className="text-[10px] text-zinc-500 leading-tight mt-0.5">
                        {node.band === 'HIGH'
                            ? 'chắc'
                            : node.band === 'REVIEW'
                                ? 'cần xác nhận'
                                : ''}
                        {node.scope === 'SHARED' && ' · dùng chung'}
                        {node.confidence > 0 && ` · ${(node.confidence * 100).toFixed(0)}%`}
                    </div>
                </div>
                {isInteractive && (
                    <ExternalLink
                        className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover/node:opacity-100 transition-opacity flex-none mt-0.5"
                        aria-hidden="true"
                    />
                )}
            </div>

            {/* Chip row */}
            {!dense && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {duration !== undefined && (
                        <span className={CHIP_BASE}>{duration}s</span>
                    )}
                    {partsCount > 1 && (
                        <span className={CHIP_BASE} title={`${partsCount} parts`}>
                            {partsCount} parts
                        </span>
                    )}
                    {audience && (
                        <span
                            className={CHIP_BASE + ' max-w-[140px] truncate'}
                            title={audience}
                        >
                            🎯 {audience}
                        </span>
                    )}
                    {statusBadge && (
                        <span
                            className={[
                                CHIP_BASE,
                                STATUS_BADGE_CLASS[node.status],
                            ].join(' ')}
                        >
                            {statusBadge}
                        </span>
                    )}
                    {node.isCompilation && (
                        <span
                            className={CHIP_BASE + ' bg-amber-500/15 text-amber-300 border-amber-500/40'}
                            title={node.note}
                        >
                            <Sparkles className="w-3 h-3" aria-hidden="true" /> nhiều hook
                        </span>
                    )}
                </div>
            )}

            {/* Note (compilation) */}
            {!dense && node.note && (
                <p
                    className="text-[10.5px] text-zinc-500 leading-snug mt-2 italic"
                    title={node.note}
                >
                    {node.note}
                </p>
            )}
        </motion.div>
    )
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function roleAbbr(role: VeloxNode['role']): string {
    switch (role) {
        case 'HOOK': return 'H'
        case 'BODY': return 'B'
        case 'CTA': return '▸'
        case 'CALLOUT': return '!'
        case 'SCRIPT': return '📄'
        case 'CAPTION': return 'CC'
        case 'FINAL': return '▣'
    }
}

function capitaliseLabel(s: string): string {
    if (!s) return s
    return s.replace(/\b([a-z])/g, (m) => m.toUpperCase())
}
