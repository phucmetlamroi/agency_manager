'use client'

import { TaskWithUser } from '@/types/admin'
import dynamic from 'next/dynamic'

// Import Desktop/Mobile views
// Dynamic import to split bundles? Or just basic import?
// For logic separation, simpler is better for now.
import DesktopTaskTable from './DesktopTaskTable' // Keeping for reference if needed
import NewDesktopTaskTable from './NewDesktopTaskTable'
import MobileTaskView from './mobile/MobileTaskView'

export default function TaskTable({
    tasks,
    isAdmin = false,
    users = [],
    isMobile = false,
    workspaceId
}: {
    tasks: TaskWithUser[],
    isAdmin?: boolean,
    users?: { id: string, username: string, reputation?: number }[],
    isMobile?: boolean,
    workspaceId: string
}) {
    // Dispatcher Logic
    if (isMobile) {
        return <MobileTaskView tasks={tasks} isAdmin={isAdmin} users={users} workspaceId={workspaceId} />
    }

    return <NewDesktopTaskTable tasks={tasks} isAdmin={isAdmin} users={users} workspaceId={workspaceId} />
}
