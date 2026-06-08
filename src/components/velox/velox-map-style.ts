/**
 * [Velox v4 — Multi-Hook Map UI style tokens]
 *
 * Centralised palette + class strings so the components stay consistent
 * with HustlyTasker's glassmorphism dark theme (see .claude/rules/
 * ui-ux-standards.md). Single import keeps colour drift out of the
 * codebase as the design evolves.
 */

import type { VeloxBand, VeloxRole, VeloxStatus } from '@/lib/velox/v4-types'

// ────────────────────────────────────────────────────────────────────────────
//  Role accent palette (Tailwind class strings, not raw hex)
// ────────────────────────────────────────────────────────────────────────────

export const ROLE_ACCENT: Record<VeloxRole, {
    /** ring + border tone */
    border: string
    /** label / icon foreground */
    text: string
    /** soft background for the role icon chip */
    chipBg: string
    /** ambient glow used as a `drop-shadow` */
    glow: string
}> = {
    HOOK: {
        border: 'border-emerald-500/30',
        text: 'text-emerald-400',
        chipBg: 'bg-emerald-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]',
    },
    BODY: {
        border: 'border-sky-500/30',
        text: 'text-sky-400',
        chipBg: 'bg-sky-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(56,189,248,0.45)]',
    },
    CTA: {
        border: 'border-violet-500/30',
        text: 'text-violet-400',
        chipBg: 'bg-violet-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(167,139,250,0.5)]',
    },
    CALLOUT: {
        border: 'border-amber-500/30',
        text: 'text-amber-400',
        chipBg: 'bg-amber-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    },
    SCRIPT: {
        border: 'border-fuchsia-500/30',
        text: 'text-fuchsia-400',
        chipBg: 'bg-fuchsia-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(232,121,249,0.4)]',
    },
    CAPTION: {
        border: 'border-cyan-500/30',
        text: 'text-cyan-400',
        chipBg: 'bg-cyan-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]',
    },
    FINAL: {
        border: 'border-rose-500/30',
        text: 'text-rose-400',
        chipBg: 'bg-rose-500/15',
        glow: 'drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]',
    },
}

// ────────────────────────────────────────────────────────────────────────────
//  Band overrides — REVIEW band lays an indigo ring on top of the role colour
// ────────────────────────────────────────────────────────────────────────────

export const BAND_RING: Record<VeloxBand, string> = {
    HIGH: '',
    REVIEW: 'ring-1 ring-indigo-400/40 ring-inset',
}

// ────────────────────────────────────────────────────────────────────────────
//  Status modifiers — applied as opacity / line-through / strikethrough
// ────────────────────────────────────────────────────────────────────────────

export const STATUS_CLASS: Record<VeloxStatus, string> = {
    ACTIVE: '',
    EXCLUDED: 'opacity-40 line-through saturate-50',
    SUPERSEDED: 'opacity-55 saturate-75',
    PENDING: 'opacity-90',
}

// ────────────────────────────────────────────────────────────────────────────
//  Card base — drop on any wrapping div to match the theme
// ────────────────────────────────────────────────────────────────────────────

export const CARD_BASE =
    'bg-zinc-950/60 backdrop-blur-xl border border-white/10 ' +
    'rounded-2xl shadow-xl shadow-black/60 ' +
    'transition-colors duration-150 ease-out'

export const CARD_HOVER = 'hover:bg-zinc-800/50 hover:border-white/15'

// ────────────────────────────────────────────────────────────────────────────
//  Chip — small pill for badges (parts count, status, duration, …)
// ────────────────────────────────────────────────────────────────────────────

export const CHIP_BASE =
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ' +
    'border border-white/10 bg-white/5 text-zinc-300'

// ────────────────────────────────────────────────────────────────────────────
//  Wire palette (for SVG fan-out paths)
// ────────────────────────────────────────────────────────────────────────────

export const WIRE_COLOR = {
    /** Hook → Body fan */
    hook: 'rgba(52,211,153,0.55)',     // emerald-400 @ 55%
    /** Body → CTA */
    body: 'rgba(167,139,250,0.55)',    // violet-400 @ 55%
    /** Excluded / superseded wires fade out */
    muted: 'rgba(160,160,160,0.22)',
}

// ────────────────────────────────────────────────────────────────────────────
//  Convenience: status badge label (rendered inside the node card)
// ────────────────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<VeloxStatus, string | null> = {
    ACTIVE: null,
    EXCLUDED: 'Loại',
    SUPERSEDED: '↻ Đã thay',
    PENDING: '⏳ Chưa xong',
}

export const STATUS_BADGE_CLASS: Record<VeloxStatus, string> = {
    ACTIVE: '',
    EXCLUDED: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    SUPERSEDED: 'bg-zinc-700/50 text-zinc-300 border-white/10',
    PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
}
