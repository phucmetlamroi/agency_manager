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

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-full flex flex-col justify-between group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                    <Activity size={20} className="text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Project Health</h2>
                    <p className="text-zinc-500 text-xs text-emerald-400">{done} of {total} completed</p>
                </div>
            </div>

            <div className="w-full">
                <div className="flex justify-between items-end mb-2">
                    <span className="text-5xl font-light text-white tracking-tighter">
                        {percentage}<span className="text-2xl text-zinc-500">%</span>
                    </span>
                    <span className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Progress</span>
                </div>
                <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-white/5 relative">
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all duration-1000 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>
        </div>
    )
}
