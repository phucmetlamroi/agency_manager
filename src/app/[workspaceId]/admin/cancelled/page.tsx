import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession } from '@/lib/auth'
import { getCancelledTasks } from '@/actions/task-actions'
import CancelledTasksClient from '@/components/tasks/CancelledTasksClient'

/**
 * [Design decision — auto-archive on cancel] Cancelled / archived tasks view.
 * A task set to 'Đã hủy' is archived (isArchived=true) so it leaves the active
 * board + Total Tasks count. This admin-only page lists those tasks and lets the
 * admin restore anything cancelled by mistake. getCancelledTasks enforces ADMIN.
 */
export default async function CancelledTasksPage({
    params,
}: {
    params: Promise<{ workspaceId: string }>
}) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')

    const res = await getCancelledTasks(workspaceId)
    const tasks = res.success ? res.data : []

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem' }}>
                <Link
                    href={`/${workspaceId}/admin`}
                    className="inline-flex items-center gap-1.5 text-[13px] text-zinc-500 hover:text-zinc-300 transition-colors mb-3"
                >
                    <ArrowLeft size={14} /> Quay lại bảng điều khiển
                </Link>
                <h2 className="title-gradient" style={{ marginBottom: 4 }}>Task đã hủy / Lưu trữ</h2>
                <p style={{ color: '#71717A', fontSize: 13 }}>
                    Task chuyển sang “Đã hủy” được lưu trữ ở đây — không còn tính vào “Tổng task” và
                    ẩn khỏi bảng làm việc. Có thể khôi phục bất cứ lúc nào nếu hủy nhầm.
                </p>
            </div>
            {!res.success && (
                <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-[13px] text-red-300">
                    {res.error}
                </div>
            )}
            <CancelledTasksClient workspaceId={workspaceId} tasks={tasks} />
        </div>
    )
}
