'use client'

import { motion } from 'framer-motion'
import { Zap, AlertTriangle, Clock, CheckCircle2, TrendingUp, CalendarClock } from 'lucide-react'

interface HeroDashboardCardProps {
    total: number
    completed: number
    inProgress: number
    actionRequired: number
    dueSoon: number
    nextDeadlineLabel: string
    title: string
}

const statCards = [
    {
        key: 'active',
        label: 'Active',
        icon: Zap,
        color: 'text-sky-400',
        bg: 'bg-sky-500/10',
        border: 'border-sky-500/20',
        glow: 'shadow-sky-500/10',
        getValue: (p: HeroDashboardCardProps) => p.inProgress,
    },
    {
        key: 'review',
        label: 'Need Review',
        icon: AlertTriangle,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        glow: 'shadow-amber-500/10',
        getValue: (p: HeroDashboardCardProps) => p.actionRequired,
    },
    {
        key: 'due',
        label: 'Due Soon',
        icon: Clock,
        color: 'text-rose-400',
        bg: 'bg-rose-500/10',
        border: 'border-rose-500/20',
        glow: 'shadow-rose-500/10',
        getValue: (p: HeroDashboardCardProps) => p.dueSoon,
    },
    {
        key: 'done',
        label: 'Completed',
        icon: CheckCircle2,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        glow: 'shadow-emerald-500/10',
        getValue: (p: HeroDashboardCardProps) => p.completed,
    },
]

export default function HeroDashboardCard(props: HeroDashboardCardProps) {
    const { total, completed, nextDeadlineLabel, title } = props
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    // Progress bar color shifts based on health
    const barGradient =
        percentage >= 75
            ? 'from-emerald-500 via-emerald-400 to-teal-300'
            : percentage >= 40
                ? 'from-amber-500 via-yellow-400 to-amber-300'
                : 'from-rose-500 via-orange-400 to-amber-300'

    const barGlow =
        percentage >= 75
            ? 'shadow-emerald-500/40'
            : percentage >= 40
                ? 'shadow-amber-500/40'
                : 'shadow-rose-500/40'

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
            className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/70 backdrop-blur-2xl shadow-2xl shadow-black/50"
        >
            {/* Background mesh gradient */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/[0.04] rounded-full blur-3xl" />
                <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-indigo-500/[0.03] rounded-full blur-3xl" />
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            </div>

            <div className="relative p-6 sm:p-8">
                {/* Header row */}
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                            className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-600/10 border border-amber-500/25 flex items-center justify-center shadow-lg shadow-amber-500/10"
                        >
                            <TrendingUp className="w-5 h-5 text-amber-400" strokeWidth={2} />
                        </motion.div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                                {title}
                            </h1>
                            <p className="text-[11px] text-zinc-500 mt-0.5 font-medium uppercase tracking-widest">
                                Project Health Overview
                            </p>
                        </div>
                    </div>

                    {/* Next deadline badge */}
                    {nextDeadlineLabel !== '--' && (
                        <motion.div
                            initial={{ opacity: 0, x: 10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="flex items-center gap-2 px-3.5 py-2 bg-zinc-900/60 border border-white/[0.06] rounded-xl"
                        >
                            <CalendarClock className="w-3.5 h-3.5 text-amber-400" strokeWidth={2} />
                            <div className="text-right">
                                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Next Deadline</p>
                                <p className="text-xs text-amber-300 font-semibold">{nextDeadlineLabel}</p>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Progress section */}
                <div className="mb-6">
                    <div className="flex items-end justify-between mb-3">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 20 }}
                            className="flex items-baseline gap-1.5"
                        >
                            <span className="text-5xl sm:text-6xl font-thin tracking-tighter bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-600 bg-clip-text text-transparent">
                                {percentage}
                            </span>
                            <span className="text-xl text-zinc-600 font-light">%</span>
                        </motion.div>
                        <span className="text-xs text-zinc-500 font-medium">
                            {completed} of {total} completed
                        </span>
                    </div>

                    {/* Animated progress bar */}
                    <div className="relative h-2.5 w-full bg-zinc-900/80 rounded-full overflow-hidden border border-white/[0.04]">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
                            className={`absolute inset-y-0 left-0 bg-gradient-to-r ${barGradient} rounded-full shadow-lg ${barGlow}`}
                        />
                        {/* Shimmer overlay on progress bar */}
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: '200%' }}
                            transition={{ duration: 2, ease: 'linear', repeat: Infinity, repeatDelay: 3, delay: 1.5 }}
                            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full"
                            style={{ maxWidth: `${percentage}%` }}
                        />
                    </div>
                </div>

                {/* Stat cards grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {statCards.map((stat, i) => {
                        const value = stat.getValue(props)
                        const Icon = stat.icon
                        return (
                            <motion.div
                                key={stat.key}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.25 + i * 0.08, type: 'spring', stiffness: 220, damping: 22 }}
                                className={`relative rounded-2xl border ${stat.border} ${stat.bg} p-3.5 shadow-lg ${stat.glow} group/stat hover:scale-[1.02] transition-transform duration-200`}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Icon className={`w-3.5 h-3.5 ${stat.color}`} strokeWidth={2} />
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                        {stat.label}
                                    </span>
                                </div>
                                <p className={`text-2xl font-light ${stat.color} tracking-tight`}>
                                    {value}
                                </p>
                                {/* Subtle glow on hover */}
                                <div className={`absolute inset-0 rounded-2xl opacity-0 group-hover/stat:opacity-100 ${stat.bg} transition-opacity duration-200 pointer-events-none`} />
                            </motion.div>
                        )
                    })}
                </div>
            </div>
        </motion.div>
    )
}
