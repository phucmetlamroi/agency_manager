'use client'

import { TaskWithUser } from '@/types/admin'
import dynamic from 'next/dynamic'

// Import Desktop/Mobile views
// Dynamic import to split bundles? Or just basic import?
// For logic separation, simpler is better for now.
import DesktopTaskTable from './DesktopTaskTable'
import MobileTaskView from './mobile/MobileTaskView'

export default function TaskTable({
    tasks,
    isAdmin = false,
    users = [],
    isMobile = false
}: {
    tasks: TaskWithUser[],
    isAdmin?: boolean,
    users?: { id: string, username: string, reputation?: number }[],
    isMobile?: boolean
}) {
    // Dispatcher Logic
    if (isMobile) {
        return <MobileTaskView tasks={tasks} isAdmin={isAdmin} users={users} />
    }

    return <DesktopTaskTable tasks={tasks} isAdmin={isAdmin} users={users} />
}
