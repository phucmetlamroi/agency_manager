'use client'

import { useTranslations } from 'next-intl'
import { Activity } from 'lucide-react'

type Task = {
    id: string
    clientStatus: string
    [key: string]: any
}

export default function ProjectHealthWidget({ tasks }: { tasks: Task[] }) {
    const t = useTranslations('Portal')
    const total = tasks.length
    const done = tasks.filter(t => t.clientStatus === 'Completed').length
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0
    const now = new Date()
    const attentionCount = tasks.filter(t => t.clientStatus === 'Action Required' || t.clientStatus === 'Revising').length
    const dueSoonCount = tasks.filter(t => {
        if (!t.deadline) return false
        const deadline = new Date(t.deadline)
        const diffDays = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        return diffDays >= 0 && diffDays <= 3 && t.clientStatus !== 'Completed'
    }).length

    return (
        <div className="bg-zinc-950/60 backdrop-blur-2xl border border-yellow-500/20 shadow-2xl shadow-black/50 rounded-3xl p-6 h-full flex flex-col justify-between group hover:-translate-y-1 hover:shadow-yellow-500/10 hover:border-yellow-500/30 transition-all duration-300">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center border border-yellow-500/20">
                    <Activity size={20} className="text-yellow-500" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Project Health</h2>
                    <p className="text-zinc-500 text-xs text-yellow-500">{done} of {total} completed</p>
                </div>
            </div>

            <div className="w-full">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-5xl font-thin tracking-tighter bg-gradient-to-br from-amber-100 via-yellow-400 to-amber-600 bg-clip-text text-transparent drop-shadow-sm">
                        {percentage}<span className="text-2xl text-zinc-500 ml-1">%</span>
                    </span>
                    <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Progress</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500 mb-3">
                    <span className="inline-flex items-center gap-1 text-yellow-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.8)]"></span>
                        {attentionCount} attention
                    </span>
                    <span className="inline-flex items-center gap-1 text-amber-500">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        {dueSoonCount} due soon
                    </span>
                </div>
                <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5 relative">
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-600 via-amber-400 to-yellow-300 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.5)] transition-all duration-1000 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>
        </div>
    )
}
