'use client'

import { motion } from 'framer-motion'
import { Calendar, Banknote, Timer } from 'lucide-react'
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

export function MarketTaskCard({ task, onClaim, index }: MarketTaskCardProps) {
    const handleDragEnd = (_: any, info: { offset: { x: number; y: number } }) => {
        // If dragged far enough, claim the task
        if (Math.abs(info.offset.x) > 120 || Math.abs(info.offset.y) > 120) {
            onClaim(task.id)
        }
    }

    const typeBadge: Record<string, { bg: string; text: string; label: string }> = {
        'Short form': { bg: 'bg-blue-500/15', text: 'text-blue-300', label: 'SHORT' },
        'Long form': { bg: 'bg-purple-500/15', text: 'text-purple-300', label: 'LONG' },
        'Trial': { bg: 'bg-amber-500/15', text: 'text-amber-300', label: 'TRIAL' },
    }
    const badge = typeBadge[task.type] || { bg: 'bg-zinc-500/15', text: 'text-zinc-300', label: task.type }

    const durationSec = durationToSeconds(task.duration)

    return (
        <motion.div
            drag
            dragSnapToOrigin
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            whileHover={{ scale: 1.02, y: -3 }}
            whileDrag={{ scale: 1.05, opacity: 0.85, zIndex: 50 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ delay: index * 0.06, type: 'spring', stiffness: 200, damping: 25 }}
            className="group bg-zinc-900/60 border border-white/10 rounded-xl p-5 cursor-grab active:cursor-grabbing hover:border-white/20 transition-all hover:shadow-xl hover:shadow-indigo-500/8"
        >
            {/* Title + Type */}
            <div className="flex justify-between items-start gap-2 mb-3">
                <h3 className="text-sm font-bold text-white flex-1 leading-snug line-clamp-2">{task.title}</h3>
                <span className={`px-2 py-0.5 ${badge.bg} ${badge.text} text-[10px] font-black rounded-lg whitespace-nowrap uppercase`}>
                    {badge.label}
                </span>
            </div>

            {/* Client info */}
            {task.client && (
                <p className="text-xs text-zinc-400 mb-3 truncate">
                    {task.client.parent ? `${task.client.parent} — ` : ''}{task.client.name}
                </p>
            )}

            {/* Metadata row */}
            <div className="flex justify-between items-center mb-3 text-xs text-zinc-400">
                {task.deadline ? (
                    <span className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" strokeWidth={1.5} />
                        {new Date(task.deadline).toLocaleDateString('vi-VN')}
                    </span>
                ) : (
                    <span className="text-zinc-600">No deadline</span>
                )}
                <span className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <Banknote className="w-3 h-3" strokeWidth={1.5} />
                    {task.value.toLocaleString('vi-VN')}đ
                </span>
            </div>

            {/* Tags */}
            {task.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {task.tags.map(tag => (
                        <span
                            key={tag.id}
                            className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[10px] font-semibold rounded-full border border-indigo-500/20"
                        >
                            {tag.name}
                        </span>
                    ))}
                </div>
            )}

            {/* Duration */}
            {durationSec > 0 && (
                <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5 mb-3">
                    <Timer className="w-3 h-3" strokeWidth={1.5} />
                    {formatDuration(durationSec)}
                </p>
            )}

            {/* Drag affordance */}
            <div className="pt-2.5 border-t border-white/5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider font-bold">
                    Kéo ra ngoài để nhận task
                </span>
            </div>
        </motion.div>
    )
}
