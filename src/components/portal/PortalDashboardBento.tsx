'use client'

import { useState } from 'react'
import ProjectHealthWidget from './ProjectHealthWidget'
import ActiveFocusWidget from './ActiveFocusWidget'
import ActivityFeedWidget from './ActivityFeedWidget'
import AssetDocumentHubWidget from './AssetDocumentHubWidget'
import PortalActionCenter from './PortalActionCenter'
import ContextualTaskDrawer from './ContextualTaskDrawer'

type Task = {
    id: string
    title: string
    type: string
    status: string
    clientStatus: string
    deadline: Date | null
    client: { id: number; name: string } | null
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
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
    const selectedTask = tasks.find(t => t.id === selectedTaskId)

    return (
        <div className="w-full">
            {/* Bento Grid Container */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-fr">

                {/* Row 1 */}
                <div className="md:col-span-8 md:row-span-1 min-h-[180px]">
                    <ProjectHealthWidget tasks={tasks} />
                </div>
                <div className="md:col-span-4 md:row-span-1 min-h-[180px]">
                    <PortalActionCenter />
                </div>

                {/* Row 2 */}
                <div className="md:col-span-5 md:row-span-2 min-h-[400px]">
                    <ActiveFocusWidget tasks={tasks} onSelectTask={setSelectedTaskId} />
                </div>
                <div className="md:col-span-4 md:row-span-2 min-h-[400px]">
                    <ActivityFeedWidget tasks={tasks} />
                </div>
                <div className="md:col-span-3 md:row-span-2 min-h-[400px]">
                    <AssetDocumentHubWidget tasks={tasks} />
                </div>

            </div>

            {/* Contextual Slider */}
            <ContextualTaskDrawer
                task={selectedTask}
                isOpen={!!selectedTaskId}
                onClose={() => setSelectedTaskId(null)}
                locale={locale}
            />
        </div>
    )
}
