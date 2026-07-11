import { notFound, redirect } from 'next/navigation'
import { loadTaskDetail } from '@/lib/task-detail-loader'
import { TaskDetailRoute } from '@/components/tasks/TaskDetailRoute'

// [P2-D3] Full-screen task-detail route (QĐ-3c). Reached by deep-link / hard
// refresh / mobile "Xem đầy đủ". Auth + fetch + money-sanitize live in the shared
// loader (fail-closed). Wrapped by the already-guarded [workspaceId]/layout.

export default async function TaskDetailPage({
    params,
}: {
    params: Promise<{ workspaceId: string; taskId: string }>
}) {
    const { workspaceId, taskId } = await params
    const data = await loadTaskDetail(workspaceId, taskId)
    if (data.kind === 'redirect') redirect(data.to)
    if (data.kind === 'notFound') notFound()

    return (
        <TaskDetailRoute
            task={data.task}
            isAdmin={data.isAdmin}
            currentUserId={data.currentUserId}
            workspaceId={workspaceId}
        />
    )
}
