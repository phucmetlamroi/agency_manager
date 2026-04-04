'use client'

import { motion } from 'framer-motion'
import { Calendar, Banknote, Timer, GripVertical, ArrowUpRight } from 'lucide-react'
import { formatDuration, durationToSeconds } from '@/lib/duration-parser'

export type MarketTask = {
    id: string
    title: string
    type: string
    deadline: string | null
    value: number
    wageVND: number
    duration: string | null
    client: { name: string; parent: string | null } | null
    tags: { id: string; name: string }[]
    createdAt: string
}

interface MarketTaskCardProps {
    task: MarketTask
    onClaim: (taskId: string) => void
    index: number
}

const TYPE_STYLES: Record<string, { accent: string; glow: string; label: string; border: string }> = {
    'Short form': {
        accent: 'from-sky-400 to-blue-500',
        glow: 'shadow-sky-500/15',
        label: 'SHORT',
        border: 'border-sky-500/20 hover:border-sky-500/35'
    },
    'Long form': {
        accent: 'from-violet-400 to-purple-500',
        glow: 'shadow-violet-500/15',
        label: 'LONG',
        border: 'border-violet-500/20 hover:border-violet-500/35'
    },
    'Trial': {
        accent: 'from-amber-400 to-orange-500',
        glow: 'shadow-amber-500/15',
        label: 'TRIAL',
        border: 'border-amber-500/20 hover:border-amber-500/35'
    },
}

const DEFAULT_STYLE = {
    accent: 'from-zinc-400 to-zinc-500',
    glow: 'shadow-zinc-500/10',
    label: 'TASK',
    border: 'border-white/10 hover:border-white/20'
}

export function MarketTaskCard({ task, onClaim, index }: MarketTaskCardProps) {
    const handleDragEnd = (_: any, info: { offset: { x: number; y: number } }) => {
        if (Math.abs(info.offset.x) > 120 || Math.abs(info.offset.y) > 120) {
            onClaim(task.id)
        }
    }

    const style = TYPE_STYLES[task.type] || DEFAULT_STYLE
    const durationSec = durationToSeconds(task.duration)

    // Deadline urgency
    let deadlineColor = 'text-zinc-500'
    let deadlineText = 'Không có deadline'
    if (task.deadline) {
        const dl = new Date(task.deadline)
        const hoursLeft = (dl.getTime() - Date.now()) / (1000 * 60 * 60)
        deadlineText = dl.toLocaleDateString('vi-VN')
        if (hoursLeft <= 0) deadlineColor = 'text-red-400 font-bold'
        else if (hoursLeft < 24) deadlineColor = 'text-red-400'
        else if (hoursLeft < 48) deadlineColor = 'text-amber-400'
        else deadlineColor = 'text-zinc-400'
    }

    return (
        <motion.div
            drag
            dragSnapToOrigin
            dragElastic={0.18}
            onDragEnd={handleDragEnd}
            whileHover={{ y: -4, transition: { type: 'spring', stiffness: 400, damping: 25 } }}
            whileDrag={{ scale: 1.04, opacity: 0.9, zIndex: 50, rotate: 1.5 }}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92, y: -15, transition: { duration: 0.2 } }}
            transition={{ delay: index * 0.07, type: 'spring', stiffness: 220, damping: 22 }}
            className={`group relative bg-zinc-900/70 backdrop-blur-sm border ${style.border} rounded-2xl overflow-hidden cursor-grab active:cursor-grabbing transition-colors shadow-xl ${style.glow}`}
        >
            {/* ── Top accent bar ── */}
            <div className={`h-[2px] bg-gradient-to-r ${style.accent} opacity-60 group-hover:opacity-100 transition-opacity`} />

            {/* ── Card body ── */}
            <div className="p-5 pb-4">
                {/* Header: Title + Type badge */}
                <div className="flex justify-between items-start gap-3 mb-3.5">
                    <h3 className="text-[13px] font-bold text-white flex-1 leading-snug line-clamp-2 group-hover:text-white/95">
                        {task.title}
                    </h3>
                    <span className={`shrink-0 px-2.5 py-1 bg-gradient-to-r ${style.accent} text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-md ${style.glow}`}>
                        {style.label}
                    </span>
                </div>

                {/* Client */}
                {task.client && (
                    <p className="text-[11px] text-zinc-500 mb-3.5 truncate font-medium">
                        {task.client.parent ? (
                            <><span className="text-zinc-400">{task.client.parent}</span> <span className="text-zinc-600 mx-0.5">/</span> </>
                        ) : null}
                        {task.client.name}
                    </p>
                )}

                {/* Metadata: Deadline + Price */}
                <div className="flex justify-between items-center mb-3 gap-2">
                    <span className={`flex items-center gap-1.5 text-[11px] ${deadlineColor}`}>
                        <Calendar className="w-3 h-3 shrink-0" strokeWidth={1.5} />
                        {deadlineText}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] font-extrabold text-emerald-400">
                        <Banknote className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
                        {task.value.toLocaleString('vi-VN')}
                        <span className="text-emerald-500/70 text-[10px]">đ</span>
                    </span>
                </div>

                {/* Tags + Duration row */}
                {(task.tags.length > 0 || durationSec > 0) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {task.tags.map(tag => (
                            <span
                                key={tag.id}
                                className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[9px] font-semibold rounded-md border border-indigo-500/15"
                            >
                                {tag.name}
                            </span>
                        ))}
                        {durationSec > 0 && (
                            <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/8 text-amber-400 text-[9px] font-semibold rounded-md border border-amber-500/15">
                                <Timer className="w-2.5 h-2.5" strokeWidth={2} />
                                {formatDuration(durationSec)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* ── Drag affordance footer ── */}
            <div className="px-5 py-2.5 border-t border-white/[0.04] bg-white/[0.015] flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all duration-200">
                <div className="flex items-center gap-1.5">
                    <GripVertical className="w-3 h-3 text-zinc-600" strokeWidth={1.5} />
                    <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
                        Kéo để nhận
                    </span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-zinc-600" strokeWidth={2} />
            </div>

            {/* ── Hover glow overlay ── */}
            <div className={`absolute inset-0 bg-gradient-to-b ${style.accent} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none rounded-2xl`} />
        </motion.div>
    )
}
