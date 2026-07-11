import { notFound, redirect } from 'next/navigation'
import { loadTaskDetail } from '@/lib/task-detail-loader'
import { getDeviceType } from '@/lib/device'
import { TaskDetailRoute } from '@/components/tasks/TaskDetailRoute'

// [P2-D3] Intercepting parallel-route slot: when a task URL is reached via an
// in-app SOFT navigation (Pattern 5), it renders as a modal OVER the current page
// instead of the standalone full-screen route. A hard refresh / deep-link falls
// through to app/[workspaceId]/task/[taskId]/page.tsx (the full page).
//
// NB: today no list flips row-click to <Link> yet (desktop keeps its fast
// in-memory state-modal), so this slot only fires from the mobile "Xem đầy đủ"
// link and future navigations — harmless until then (default.tsx renders null).

export default async function InterceptedTaskDetail({
    params,
}: {
    params: Promise<{ workspaceId: string; taskId: string }>
}) {
    const { workspaceId, taskId } = await params
    const [data, deviceType] = await Promise.all([
        loadTaskDetail(workspaceId, taskId),
        getDeviceType(),
    ])
    if (data.kind === 'redirect') redirect(data.to)
    if (data.kind === 'notFound') notFound()

    return (
        <TaskDetailRoute
            task={data.task}
            isAdmin={data.isAdmin}
            currentUserId={data.currentUserId}
            workspaceId={workspaceId}
            deviceType={deviceType}
        />
    )
}
