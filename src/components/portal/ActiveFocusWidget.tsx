'use client'

import { useTranslations } from 'next-intl'
import { Flame } from 'lucide-react'
import PortalStatusBadge from './PortalStatusBadge'

type Task = {
    id: string
    title: string
    clientStatus: string
    type: string
    [key: string]: any
}

export default function ActiveFocusWidget({ tasks, onSelectTask }: { tasks: Task[], onSelectTask: (taskId: string) => void }) {
    const t = useTranslations('Portal')

    // Sort logic to prioritize Action Required, Revising, In Progress
    const priority = ['Action Required', 'Revising', 'In Progress', 'Pending', 'Completed']
    const activeTasks = [...tasks].sort((a, b) => {
        return priority.indexOf(a.clientStatus) - priority.indexOf(b.clientStatus)
    }).slice(0, 5) // Show top 5

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                    <Flame size={20} className="text-orange-400" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Active Focus</h2>
                    <p className="text-zinc-500 text-xs">High priority items</p>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 overflow-y-auto pr-2 relative z-10 custom-scrollbar">
                {activeTasks.length > 0 ? activeTasks.map(task => (
                    <button
                        key={task.id}
                        onClick={() => onSelectTask(task.id)}
                        className="w-full text-left bg-zinc-900/50 hover:bg-zinc-800/80 border border-white/5 hover:border-white/10 p-4 rounded-2xl flex flex-col gap-3 transition-all duration-300 group/card"
                    >
                        <div className="flex justify-between items-start gap-4">
                            <h3 className="text-sm font-medium text-zinc-200 group-hover/card:text-white truncate flex-1">
                                {task.title}
                            </h3>
                            <PortalStatusBadge status={task.clientStatus} pulse={task.clientStatus === 'Action Required'} />
                        </div>
                        <div className="flex justify-between items-end">
                            <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                                {task.type}
                            </span>
                            <span className="text-xs text-indigo-400 group-hover/card:text-indigo-300 opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1">
                                Open Details &rarr;
                            </span>
                        </div>
                    </button>
                )) : (
                    <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs italic">
                        No active tasks
                    </div>
                )}
            </div>
        </div>
    )
}
