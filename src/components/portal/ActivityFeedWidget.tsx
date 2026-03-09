'use client'

import { useTranslations } from 'next-intl'
import { Bell, CopyPlus, MessageSquare, Check, RotateCcw } from 'lucide-react'

type Task = {
    id: string
    title: string
    clientStatus: string
    updatedAt: Date
}

export default function ActivityFeedWidget({ tasks }: { tasks: Task[] }) {
    const t = useTranslations('Portal')

    // Sort tasks by updatedAt to simulate an activity feed
    const recentActivity = [...tasks]
        .filter(t => t.updatedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)

    // Helper to get icon based on status
    const getIconInfo = (status: string) => {
        switch (status) {
            case 'Completed': return { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
            case 'Revising': return { icon: RotateCcw, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
            case 'Action Required': return { icon: MessageSquare, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' }
            case 'In Progress': return { icon: CopyPlus, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
            default: return { icon: Bell, color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700' }
        }
    }

    return (
        <div className="bg-zinc-950/40 backdrop-blur-xl border border-white/5 rounded-3xl p-6 h-full flex flex-col group hover:-translate-y-1 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                    <Bell size={20} className="text-blue-400" />
                </div>
                <div>
                    <h2 className="text-white font-medium">Activity Feed</h2>
                    <p className="text-zinc-500 text-xs">Real-time updates</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                <div className="relative border-l border-zinc-800/50 space-y-4 pb-4 ml-3">
                    {recentActivity.length > 0 ? recentActivity.map(activity => {
                        const info = getIconInfo(activity.clientStatus)
                        const Icon = info.icon

                        return (
                            <div key={activity.id} className="relative pl-6 sm:pl-8 group/item">
                                <span className={`absolute -left-3 top-1 flex items-center justify-center w-6 h-6 rounded-full border ${info.bg} ${info.border}`}>
                                    <Icon size={10} className={info.color} />
                                </span>
                                <div className="flex flex-col">
                                    <p className="text-xs text-zinc-300 font-medium group-hover/item:text-white transition-colors truncate">
                                        <span className="opacity-60 font-normal">Task </span>
                                        "{activity.title}"
                                        <span className="opacity-60 font-normal"> is now </span>
                                        <span className={info.color}>{activity.clientStatus}</span>
                                    </p>
                                    <span className="text-[10px] text-zinc-600 font-mono mt-1">
                                        {new Date(activity.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(activity.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                        )
                    }) : (
                        <div className="pl-6 text-zinc-500 text-xs italic">No recent activity</div>
                    )}
                </div>
            </div>
        </div>
    )
}
