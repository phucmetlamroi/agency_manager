/**
 * [Hook Graph — editor style tokens]
 *
 * A small, explicit palette for the manual whiteboard. Blocks carry a free
 * `tag` (the user picks one, or the Velox seed maps a role → tag); the tag
 * drives the card's left rail + port glow. One brand accent (violet) is the
 * default for untagged blocks, in keeping with the app's glass-dark theme.
 */

import type { HookBlockStatus } from '@/lib/velox/hook-graph-types'

export interface TagStyle {
    key: string
    label: string
    /** Base hex — used for the rail, dot, handle glow. */
    hex: string
}

/** The pickable tag swatches (ordered for the palette row). */
export const TAG_PALETTE: TagStyle[] = [
    { key: 'hook', label: 'Hook', hex: '#34d399' }, // emerald
    { key: 'body', label: 'Body', hex: '#38bdf8' }, // sky
    { key: 'cta', label: 'CTA', hex: '#a78bfa' }, // violet
    { key: 'callout', label: 'Callout', hex: '#f59e0b' }, // amber
    { key: 'script', label: 'Script', hex: '#e879f9' }, // fuchsia
    { key: 'caption', label: 'Caption', hex: '#22d3ee' }, // cyan
    { key: 'product', label: 'Sản phẩm', hex: '#f472b6' }, // pink
    { key: 'final', label: 'Kết', hex: '#fb7185' }, // rose
]

/** Brand violet — the default rail for blocks with no tag. */
export const DEFAULT_TAG_HEX = '#8b5cf6'

const TAG_BY_KEY = new Map(TAG_PALETTE.map((t) => [t.key, t]))

export function tagHex(tag?: string): string {
    if (!tag) return DEFAULT_TAG_HEX
    return TAG_BY_KEY.get(tag)?.hex ?? DEFAULT_TAG_HEX
}

export function tagLabel(tag?: string): string | null {
    if (!tag) return null
    return TAG_BY_KEY.get(tag)?.label ?? tag
}

/** rgba() helper for translucent fills/glows from a hex. */
export function rgba(hex: string, alpha: number): string {
    const h = hex.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export const STATUS_META: Record<HookBlockStatus, { label: string; hex: string }> = {
    DRAFT: { label: 'Nháp', hex: '#a1a1aa' }, // zinc
    EDITING: { label: 'Đang dựng', hex: '#eab308' }, // yellow
    REVIEW: { label: 'Chờ duyệt', hex: '#38bdf8' }, // sky
    APPROVED: { label: 'Đã duyệt', hex: '#34d399' }, // emerald
    REJECTED: { label: 'Cần sửa', hex: '#fb7185' }, // rose
}

export const STATUS_ORDER: HookBlockStatus[] = [
    'DRAFT',
    'EDITING',
    'REVIEW',
    'APPROVED',
    'REJECTED',
]
