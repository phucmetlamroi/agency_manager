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
            {/* Split layout: Action Center (Priority) & Asset Hub */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <PortalActionCenter tasks={tasks} workspaceId={workspaceId} locale={locale} />
                <AssetDocumentHubWidget tasks={tasks} />
            </div>
        </div>
    )
}
