'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, Clock, Inbox, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import PortalStatusBadge from './PortalStatusBadge'

type Task = {
    id: string
    title: string
    clientStatus: string
    deadline: Date | string | null
}

export default function PortalActionCenter({
    tasks,
    workspaceId,
    locale
}: {
    tasks: Task[]
    workspaceId: string
    locale: string
}) {
    const now = new Date()

    const attentionTasks = useMemo(() => {
        const list = tasks.filter(t => t.clientStatus === 'Action Required' || t.clientStatus === 'Revising')
        return list.sort((a, b) => {
            const aTime = a.deadline ? new Date(a.deadline).getTime() : Number.MAX_SAFE_INTEGER
            const bTime = b.deadline ? new Date(b.deadline).getTime() : Number.MAX_SAFE_INTEGER
            return aTime - bTime
        })
    }, [tasks])

    const actionRequiredCount = attentionTasks.filter(t => t.clientStatus === 'Action Required').length
    const revisingCount = attentionTasks.filter(t => t.clientStatus === 'Revising').length
    const dueSoonCount = tasks.filter(t => {
        if (!t.deadline) return false
        const deadline = new Date(t.deadline)
        const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        return diffDays >= 0 && diffDays <= 3 && t.clientStatus !== 'Completed'
    }).length

    const visible = attentionTasks.slice(0, 3)

    const stats = [
        { label: 'Action', value: actionRequiredCount, color: 'text-rose-400', border: 'border-rose-500/15', bg: 'bg-rose-500/[0.06]' },
        { label: 'Revisions', value: revisingCount, color: 'text-orange-400', border: 'border-orange-500/15', bg: 'bg-orange-500/[0.06]' },
        { label: 'Due Soon', value: dueSoonCount, color: 'text-amber-400', border: 'border-amber-500/15', bg: 'bg-amber-500/[0.06]' },
    ]

    return (
        <div className="relative bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] shadow-xl shadow-black/40 rounded-3xl p-6 h-full flex flex-col overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute -top-16 -left-16 w-40 h-40 bg-rose-500/[0.03] rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-5 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500/15 to-orange-500/5 flex items-center justify-center border border-rose-500/20 shadow-lg shadow-rose-500/5">
                    <Inbox size={18} className="text-rose-400" />
                </div>
                <div>
                    <h2 className="text-white font-semibold">Priority Inbox</h2>
                    <p className="text-zinc-500 text-xs">Items that need your attention</p>
                </div>
                {attentionTasks.length > 0 && (
                    <span className="ml-auto text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full">
                        {attentionTasks.length}
                    </span>
                )}
            </div>

            {/* Stat pills */}
            <div className="grid grid-cols-3 gap-2 mb-4 relative z-10">
                {stats.map(s => (
                    <div key={s.label} className={`rounded-xl border ${s.border} ${s.bg} p-2.5 text-center`}>
                        <p className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold">{s.label}</p>
                        <p className={`text-lg font-light ${s.color} mt-0.5`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Task cards */}
            <div className="flex-1 space-y-2 relative z-10">
                {visible.length > 0 ? visible.map((task, i) => (
                    <motion.div
                        key={task.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06, duration: 0.2 }}
                    >
                        <Link
                            href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                            className="group/row flex items-center gap-3 bg-zinc-900/40 hover:bg-zinc-900/70 border border-white/[0.04] hover:border-white/[0.08] p-3.5 rounded-xl transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
                        >
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-zinc-200 font-medium truncate group-hover/row:text-white transition-colors">
                                    {task.title}
                                </p>
                                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-500">
                                    <PortalStatusBadge
                                        status={task.clientStatus}
                                        pulse={task.clientStatus === 'Action Required'}
                                        size="compact"
                                    />
                                    {task.deadline && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock size={10} /> {new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <ArrowUpRight size={14} className="text-zinc-600 group-hover/row:text-rose-400 transition-colors shrink-0" />
                        </Link>
                    </motion.div>
                )) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500 bg-zinc-900/20 border border-dashed border-white/[0.04] rounded-xl py-8">
                        <div className="text-center">
                            <AlertCircle size={20} className="mx-auto mb-2 text-zinc-700" />
                            All caught up. No urgent actions.
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
