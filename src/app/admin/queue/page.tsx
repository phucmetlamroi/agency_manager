import { prisma } from '@/lib/db'
import TaskTable from '@/components/TaskTable'
import { checkOverdueTasks } from '@/actions/reputation-actions'

import { checkOverdueTasks } from '@/actions/reputation-actions'
import { serializeDecimal } from '@/lib/serialization'

export default async function TaskQueuePage() {
    await checkOverdueTasks() // Ensure queue is fresh

    const tasks = await prisma.task.findMany({
        include: {
            assignee: true,
            client: {
                include: { parent: true }
            }
        },
        orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
        orderBy: { username: 'asc' },
        include: { ownedAgency: true }
    })

    const agencies = await prisma.agency.findMany({
        select: { id: true, name: true, code: true }
    })

    const unassignedTasks = tasks.filter(t => !t.assigneeId && !t.assignedAgencyId)

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(139, 92, 246, 0.3)', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                    <div>
                        <h2 className="title-gradient" style={{ margin: 0, fontSize: '1.8rem' }}>📦 Kho Task Đợi</h2>
                        <p style={{ color: '#888', marginTop: '0.5rem' }}>
                            Danh sách các công việc chưa có người nhận. Vui lòng phân công cho nhân viên.
                        </p>
                    </div>
                    <span style={{
                        background: '#6d28d9', color: 'white', padding: '0.5rem 1rem',
                        borderRadius: '20px', fontWeight: 'bold'
                    }}>
                        {unassignedTasks.length} Task
                    </span>
                </div>

                {unassignedTasks.length > 0 ? (
                    <TaskTable tasks={serializeDecimal(unassignedTasks) as any} isAdmin={true} users={users} agencies={agencies} />
                ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666', border: '1px dashed #444', borderRadius: '12px' }}>
                        <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Kho đang trống!</p>
                        <p style={{ fontSize: '0.9rem' }}>Tuyệt vời, mọi công việc đều đã được phân công.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
