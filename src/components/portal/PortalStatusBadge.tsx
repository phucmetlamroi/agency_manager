'use client'

import { Clock, PlayCircle, AlertCircle, RotateCcw, CheckCircle2 } from 'lucide-react'

/*
 * PortalStatusBadge v2 — "Holographic Signal Lamp"
 *
 * Each status is a living indicator with unique CSS animation,
 * frosted glass surface, neon inner glow. Pure CSS keyframes
 * defined in globals.css — zero JS animation overhead.
 *
 * Props: { status, pulse?, size? }
 */

type StatusDef = {
    icon: React.ElementType
    text: string
    bg: string
    border: string
    glow: string
    /** CSS class that activates the ::after animation overlay */
    animation: string
    dot: string
}

const STATUS_MAP: Record<string, StatusDef> = {
    Pending: {
        icon: Clock,
        text: 'text-cyan-300',
        bg: 'bg-cyan-500/[0.08]',
        border: 'border-cyan-400/25',
        glow: 'shadow-[0_0_12px_rgba(34,211,238,0.15),inset_0_1px_0_rgba(34,211,238,0.1)]',
        animation: 'portal-badge-breathe',
        dot: 'bg-cyan-400',
    },
    'In Progress': {
        icon: PlayCircle,
        text: 'text-violet-300',
        bg: 'bg-violet-500/[0.08]',
        border: 'border-violet-400/25',
        glow: 'shadow-[0_0_12px_rgba(167,139,250,0.15),inset_0_1px_0_rgba(167,139,250,0.1)]',
        animation: 'portal-badge-scan',
        dot: 'bg-violet-400',
    },
    'Action Required': {
        icon: AlertCircle,
        text: 'text-rose-300',
        bg: 'bg-rose-500/[0.08]',
        border: 'border-rose-400/30',
        glow: 'shadow-[0_0_14px_rgba(251,113,133,0.2),inset_0_1px_0_rgba(251,113,133,0.12)]',
        animation: 'portal-badge-urgency',
        dot: 'bg-rose-400',
    },
    Revising: {
        icon: RotateCcw,
        text: 'text-orange-300',
        bg: 'bg-orange-500/[0.08]',
        border: 'border-orange-400/25',
        glow: 'shadow-[0_0_12px_rgba(251,146,60,0.15),inset_0_1px_0_rgba(251,146,60,0.1)]',
        animation: 'portal-badge-spin-icon',
        dot: 'bg-orange-400',
    },
    Completed: {
        icon: CheckCircle2,
        text: 'text-emerald-300',
        bg: 'bg-emerald-500/[0.08]',
        border: 'border-emerald-400/25',
        glow: 'shadow-[0_0_12px_rgba(52,211,153,0.15),inset_0_1px_0_rgba(52,211,153,0.1)]',
        animation: 'portal-badge-settle',
        dot: 'bg-emerald-400',
    },
}

const FALLBACK = STATUS_MAP['Pending']

export default function PortalStatusBadge({
    status,
    pulse = false,
    size = 'default',
}: {
    status: string
    pulse?: boolean
    size?: 'compact' | 'default'
}) {
    const cfg = STATUS_MAP[status] ?? FALLBACK
    const Icon = cfg.icon
    const isCompact = size === 'compact'

    return (
        <div
            className={[
                // animation class attaches the ::after overlay from globals.css
                cfg.animation,
                'group/badge relative inline-flex items-center gap-1.5 shrink-0',
                'backdrop-blur-md rounded-full border overflow-hidden',
                isCompact ? 'px-2 py-0.5' : 'px-2.5 py-1',
                cfg.bg, cfg.border, cfg.glow,
                'hover:scale-[1.04] active:scale-100 transition-transform duration-150',
            ].join(' ')}
        >
            {/* Indicator: pulse dot OR icon */}
            {pulse ? (
                <span className="relative flex h-2 w-2 shrink-0 z-[1]">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${cfg.dot}`} />
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`}
                        style={{ boxShadow: '0 0 6px currentColor' }}
                    />
                </span>
            ) : (
                <span className={[
                    'relative shrink-0 z-[1]',
                    cfg.text,
                    cfg.animation === 'portal-badge-spin-icon' ? 'portal-badge-icon-spin' : '',
                ].join(' ')}>
                    <Icon size={isCompact ? 10 : 12} strokeWidth={2.2} />
                </span>
            )}

            {/* Label */}
            <span
                className={[
                    'relative z-[1] uppercase font-bold tracking-wider leading-none',
                    isCompact ? 'text-[8px]' : 'text-[10px]',
                    cfg.text,
                ].join(' ')}
                style={{ textShadow: '0 0 8px currentColor' }}
            >
                {status}
            </span>
        </div>
    )
}
