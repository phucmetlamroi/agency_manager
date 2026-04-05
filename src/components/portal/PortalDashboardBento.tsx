'use client'

import { motion } from 'framer-motion'
import AssetDocumentHubWidget from './AssetDocumentHubWidget'
import PortalActionCenter from './PortalActionCenter'
import ActivityFeedWidget from './ActivityFeedWidget'

type Task = {
    id: string
    title: string
    type: string
    status: string
    clientStatus: string
    deadline: Date | null
    client: { id: number; name: string; parent?: { name: string } | null } | null
    clientPath?: string | null
    productLink?: string | null
    notes_en?: string | null
    notes_vi?: string | null
    updatedAt: Date
    [key: string]: any
}

export default function PortalDashboardBento({
    tasks,
    locale,
    workspaceId
}: {
    tasks: Task[]
    locale: string
    workspaceId: string
}) {
    return (
        <div className="w-full space-y-5">
            {/* Section label */}
            <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-[0.2em]">Dashboard Widgets</span>
                <div className="h-px flex-1 bg-gradient-to-l from-white/[0.06] to-transparent" />
            </div>

            {/* 5E: Responsive bento grid — 1col mobile, 2col tablet, 3col desktop */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.3 }}
                >
                    <PortalActionCenter tasks={tasks} workspaceId={workspaceId} locale={locale} />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.3 }}
                >
                    <AssetDocumentHubWidget tasks={tasks} />
                </motion.div>
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="md:col-span-2 lg:col-span-1"
                >
                    <ActivityFeedWidget tasks={tasks} />
                </motion.div>
            </div>
        </div>
    )
}
