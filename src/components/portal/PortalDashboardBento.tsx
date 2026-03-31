'use client'

import ProjectHealthWidget from './ProjectHealthWidget'
import AssetDocumentHubWidget from './AssetDocumentHubWidget'
import PortalActionCenter from './PortalActionCenter'

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
    return (
        <div className="w-full">
            {/* Bento Grid Container */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 auto-rows-fr">

                {/* Row 1 */}
                <div className="md:col-span-8 md:row-span-1 min-h-[220px]">
                    <PortalActionCenter tasks={tasks} workspaceId={workspaceId} locale={locale} />
                </div>
                <div className="md:col-span-4 md:row-span-1 min-h-[220px]">
                    <ProjectHealthWidget tasks={tasks} />
                </div>

                {/* Row 2 */}
                <div className="md:col-span-12 md:row-span-1 min-h-[320px]">
                    <AssetDocumentHubWidget tasks={tasks} />
                </div>

            </div>
        </div>
    )
}
