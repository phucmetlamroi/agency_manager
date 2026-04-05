'use client'

import { useTranslations } from 'next-intl'
import { motion } from 'framer-motion'
import { Bell, CopyPlus, MessageSquare, Check, RotateCcw } from 'lucide-react'

type Task = {
    id: string
    title: string
    clientStatus: string
    updatedAt: Date
}

const ICON_MAP: Record<string, { icon: typeof Check; color: string; bg: string; border: string; line: string }> = {
    Completed: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', line: 'bg-emerald-500/30' },
    Revising: { icon: RotateCcw, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/25', line: 'bg-orange-500/30' },
    'Action Required': { icon: MessageSquare, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/25', line: 'bg-rose-500/30' },
    'In Progress': { icon: CopyPlus, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/25', line: 'bg-violet-500/30' },
}
const DEFAULT_ICON = { icon: Bell, color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700', line: 'bg-zinc-700/30' }

const COPY_MAP: Record<string, string> = {
    'Action Required': 'needs your review',
    Revising: 'is in revision',
    'In Progress': 'is in progress',
    Completed: 'was delivered',
}

export default function ActivityFeedWidget({ tasks }: { tasks: Task[] }) {
    const t = useTranslations('Portal')

    const recentActivity = [...tasks]
        .filter(t => t.updatedAt)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8)

    return (
        <div className="relative bg-zinc-950/60 backdrop-blur-2xl border border-white/[0.06] shadow-xl shadow-black/40 rounded-3xl p-6 h-full flex flex-col overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute -top-16 -right-16 w-40 h-40 bg-blue-500/[0.04] rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-6 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-indigo-500/5 flex items-center justify-center border border-blue-500/20 shadow-lg shadow-blue-500/5">
                    <Bell size={18} className="text-blue-400" />
                </div>
                <div>
                    <h2 className="text-white font-semibold">Activity Feed</h2>
                    <p className="text-zinc-500 text-xs">Real-time updates</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative z-10">
                <div className="relative space-y-1 pb-2 ml-3">
                    {/* Timeline line */}
                    <div className="absolute left-0 top-2 bottom-2 w-px bg-gradient-to-b from-blue-500/20 via-zinc-800/50 to-transparent" />

                    {recentActivity.length > 0 ? recentActivity.map((activity, i) => {
                        const info = ICON_MAP[activity.clientStatus] || DEFAULT_ICON
                        const Icon = info.icon
                        const copy = COPY_MAP[activity.clientStatus] || `is now ${activity.clientStatus}`

                        return (
                            <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05, duration: 0.2 }}
                                className="relative pl-7 py-2.5 group/item rounded-xl hover:bg-white/[0.02] transition-colors"
                            >
                                {/* Timeline node */}
                                <span className={`absolute left-[-5px] top-3.5 flex items-center justify-center w-[10px] h-[10px] rounded-full border ${info.bg} ${info.border} shadow-sm`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${info.color.replace('text-', 'bg-')}`} />
                                </span>

                                <p className="text-xs text-zinc-400 leading-relaxed">
                                    <span className="text-zinc-200 font-medium group-hover/item:text-white transition-colors">
                                        {activity.title}
                                    </span>
                                    {' '}
                                    <span className={`${info.color} font-medium`}>{copy}</span>
                                </p>
                                <span className="text-[10px] text-zinc-600 font-mono mt-0.5 block">
                                    {new Date(activity.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {' · '}
                                    {new Date(activity.updatedAt).toLocaleDateString()}
                                </span>
                            </motion.div>
                        )
                    }) : (
                        <div className="pl-6 py-8 text-zinc-500 text-xs text-center">No recent activity</div>
                    )}
                </div>
            </div>
        </div>
    )
}
