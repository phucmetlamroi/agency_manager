'use client'

import { motion } from 'framer-motion'
import { useDraggable } from '@dnd-kit/core'
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
    index: number
}

const TYPE_STYLES: Record<string, { accent: string; glow: string; label: string; border: string; borderSolid: string }> = {
    'Short form': {
        accent: 'from-sky-400 to-blue-500',
        glow: 'shadow-sky-500/15',
        label: 'SHORT',
        border: 'border-sky-500/20 hover:border-sky-500/35',
        borderSolid: 'border-sky-500/30',
    },
    'Long form': {
        accent: 'from-violet-400 to-purple-500',
        glow: 'shadow-violet-500/15',
        label: 'LONG',
        border: 'border-violet-500/20 hover:border-violet-500/35',
        borderSolid: 'border-violet-500/30',
    },
    'Trial': {
        accent: 'from-amber-400 to-orange-500',
        glow: 'shadow-amber-500/15',
        label: 'TRIAL',
        border: 'border-amber-500/20 hover:border-amber-500/35',
        borderSolid: 'border-amber-500/30',
    },
}

const DEFAULT_STYLE = {
    accent: 'from-zinc-400 to-zinc-500',
    glow: 'shadow-zinc-500/10',
    label: 'TASK',
    border: 'border-white/10 hover:border-white/20',
    borderSolid: 'border-white/15',
}

// ── Shared visual body (used by both card & overlay) ──
function CardBody({ task, style, isOverlay = false }: {
    task: MarketTask
    style: typeof DEFAULT_STYLE
    isOverlay?: boolean
}) {
    const durationSec = durationToSeconds(task.duration)

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
        <>
            {/* Top accent bar */}
            <div className={`h-[2px] bg-gradient-to-r ${style.accent} ${isOverlay ? 'opacity-90' : 'opacity-60 group-hover:opacity-100'} transition-opacity`} />

            {/* Card body */}
            <div className="p-5 pb-4">
                <div className="flex justify-between items-start gap-3 mb-3.5">
                    <h3 className="text-[13px] font-bold text-white flex-1 leading-snug line-clamp-2">
                        {task.title}
                    </h3>
                    <span className={`shrink-0 px-2.5 py-1 bg-gradient-to-r ${style.accent} text-white text-[9px] font-black rounded-lg uppercase tracking-wider shadow-md ${style.glow}`}>
                        {style.label}
                    </span>
                </div>

                {task.client && (
                    <p className="text-[11px] text-zinc-500 mb-3.5 truncate font-medium">
                        {task.client.parent ? (
                            <><span className="text-zinc-400">{task.client.parent}</span><span className="text-zinc-600 mx-0.5"> / </span></>
                        ) : null}
                        {task.client.name}
                    </p>
                )}

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

                {(task.tags.length > 0 || durationSec > 0) && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {task.tags.map(tag => (
                            <span key={tag.id} className="px-2 py-0.5 bg-indigo-500/10 text-indigo-300 text-[9px] font-semibold rounded-md border border-indigo-500/15">
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

            {/* Footer */}
            <div className={`px-5 py-2.5 border-t border-white/[0.04] bg-white/[0.015] flex items-center justify-between ${isOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-all duration-200`}>
                <div className="flex items-center gap-1.5">
                    <GripVertical className="w-3 h-3 text-zinc-600" strokeWidth={1.5} />
                    <span className="text-[9px] text-zinc-600 uppercase tracking-widest font-bold">
                        {isOverlay ? 'Đang kéo...' : 'Kéo để nhận'}
                    </span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-zinc-600" strokeWidth={2} />
            </div>

            {/* Hover glow */}
            <div className={`absolute inset-0 bg-gradient-to-b ${style.accent} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none rounded-2xl`} />
        </>
    )
}

// ── Draggable card (ghost when dragging) ──
export function MarketTaskCard({ task, index }: MarketTaskCardProps) {
    const style = TYPE_STYLES[task.type] || DEFAULT_STYLE
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

    return (
        <motion.div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{
                opacity: isDragging ? 0.2 : 1,
                scale: isDragging ? 0.93 : 1,
                y: 0,
            }}
            exit={{ opacity: 0, scale: 0.92, y: -15, transition: { duration: 0.2 } }}
            transition={{
                delay: isDragging ? 0 : index * 0.07,
                type: 'spring',
                stiffness: 220,
                damping: 22,
            }}
            whileHover={isDragging ? undefined : {
                y: -4,
                transition: { type: 'spring', stiffness: 400, damping: 25 }
            }}
            className={`group relative bg-zinc-900/70 backdrop-blur-sm border ${style.border} rounded-2xl overflow-hidden transition-colors shadow-xl ${style.glow}`}
            style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
        >
            <CardBody task={task} style={style} />
        </motion.div>
    )
}

// ── Visual clone for DragOverlay (no useDraggable, renders via Portal) ──
export function MarketTaskCardOverlay({ task }: { task: MarketTask }) {
    const style = TYPE_STYLES[task.type] || DEFAULT_STYLE

    return (
        <div
            className={`group relative bg-zinc-900/98 backdrop-blur-sm border ${style.borderSolid} rounded-2xl overflow-hidden shadow-2xl ${style.glow}`}
            style={{
                cursor: 'grabbing',
                transform: 'rotate(2deg) scale(1.04)',
                willChange: 'transform',
                pointerEvents: 'none',
                boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)',
            }}
        >
            <CardBody task={task} style={style} isOverlay />
        </div>
    )
}
