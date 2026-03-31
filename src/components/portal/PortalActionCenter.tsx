'use client'

import { useMemo } from 'react'
import { AlertCircle, RotateCcw, Clock, Inbox } from 'lucide-react'
import Link from 'next/link'

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

    return (
        <div className="bg-zinc-950/60 backdrop-blur-2xl border border-yellow-500/20 shadow-2xl shadow-black/50 rounded-3xl p-6 h-full flex flex-col group hover:-translate-y-1 hover:shadow-yellow-500/10 hover:border-yellow-500/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                    <Inbox size={18} className="text-yellow-500" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Priority Inbox</h2>
                    <p className="text-zinc-500 text-xs">Items that need your attention</p>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="rounded-2xl border border-yellow-500/10 bg-zinc-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Action</p>
                    <p className="text-lg font-light text-yellow-500">{actionRequiredCount}</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Revisions</p>
                    <p className="text-lg font-light text-amber-500">{revisingCount}</p>
                </div>
                <div className="rounded-2xl border border-white/5 bg-zinc-900/60 p-3">
                    <p className="text-[10px] uppercase tracking-widest text-zinc-500">Due Soon</p>
                    <p className="text-lg font-light text-zinc-300">{dueSoonCount}</p>
                </div>
            </div>

            <div className="flex-1 space-y-2">
                {visible.length > 0 ? visible.map(task => (
                    <Link
                        key={task.id}
                        href={`/portal/${locale}/${workspaceId}/tasks/${task.id}`}
                        className="block w-full text-left bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/5 p-4 rounded-2xl transition-colors group/row"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm text-zinc-200 font-medium truncate group-hover/row:text-white">
                                    {task.title}
                                </p>
                                <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-500">
                                    {task.clientStatus === 'Action Required' ? (
                                        <span className="inline-flex items-center gap-1 text-yellow-500">
                                            <AlertCircle size={12} /> Action required
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1 text-amber-500">
                                            <RotateCcw size={12} /> Revising
                                        </span>
                                    )}
                                    {task.deadline && (
                                        <span className="inline-flex items-center gap-1">
                                            <Clock size={12} /> {new Date(task.deadline).toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="text-[10px] uppercase tracking-widest text-yellow-600 group-hover/row:text-yellow-400 transition-colors">Open</span>
                        </div>
                    </Link>
                )) : (
                    <div className="flex h-full items-center justify-center text-xs text-zinc-500 bg-zinc-900/30 border border-dashed border-white/5 rounded-2xl">
                        All caught up. No urgent actions.
                    </div>
                )}
            </div>
            <div className="mt-4 text-right">
                <a href="#all-tasks" className="text-[10px] uppercase tracking-widest text-zinc-500 hover:text-yellow-500 transition-colors">
                    Open full task list
                </a>
            </div>
        </div>
    )
}
