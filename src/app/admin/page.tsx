import { prisma } from '@/lib/db'
import { createTask } from '@/actions/admin-actions'
import { deleteTask } from '@/actions/task-management-actions'
import { revalidatePath } from 'next/cache'
import TaskTable from '@/components/TaskTable'

export default async function AdminDashboard() {
    const tasks = await prisma.task.findMany({
        include: { assignee: true },
        orderBy: { createdAt: 'desc' }
    })

    const users = await prisma.user.findMany({
        orderBy: { username: 'asc' }
    })

    const unassignedTasks = tasks.filter(t => !t.assigneeId)
    const assignedTasks = tasks.filter(t => t.assigneeId)

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem', alignItems: 'start' }}>

            {/* Create Task Form */}
            <div className="glass-panel" style={{ padding: '1.5rem', height: 'fit-content' }}>
                <h3 style={{ marginBottom: '1rem', color: 'var(--secondary)' }}>Giao Việc Mới</h3>
                <form action={async (formData) => {
                    'use server'
                    await createTask(formData)
                }} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Tên công việc</label>
                        <input name="title" required placeholder="Nhập tên task..."
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Giá trị (VNĐ)</label>
                        <input name="value" type="number" required placeholder="500000"
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>

                    {/* New Fields Gen Z Style */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>Loại Task</label>
                            <select name="type" required
                                style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                                <option value="Short form">Short form</option>
                                <option value="Long form">Long form</option>
                                <option value="Trial">Trial</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>Deadline (Giờ + Ngày)</label>
                            <input name="deadline" type="datetime-local"
                                style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Resources (Raw/B-roll Link)</label>
                        <input name="resources" placeholder="Link folder..."
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>References (Sample Video)</label>
                        <input name="references" placeholder="Link video mẫu..."
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Ghi chú (Notes)</label>
                        <textarea name="notes" placeholder="Yêu cầu cụ thể..." rows={3}
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: '0.8rem', color: '#888' }}>Giao cho nhân viên</label>
                        <select name="assigneeId"
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                            <option value="">-- Để trống (Vào Kho Task Đợi) --</option>
                            {users.sort((a: any, b: any) => (b.reputation || 0) - (a.reputation || 0)).map((u: any) => {
                                const score = u.reputation ?? 100
                                let badge = ''
                                if (score >= 90) badge = '⭐ Top Rated'
                                else if (score < 50) badge = '⚠️ Cần giám sát'

                                return (
                                    <option key={u.id} value={u.id}>
                                        {u.username} ({score}đ) {badge}
                                    </option>
                                )
                            })}
                        </select>
                    </div>

                    <button className="btn btn-primary" type="submit">Tạo Task</button>
                </form>
            </div>

            {/* Task Lists */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>

                {/* ACTIVE TASKS */}
                <div>
                    <h3 style={{ marginBottom: '1rem', color: '#ccc' }}>🔥 Đang Thực Hiện ({assignedTasks.length})</h3>
                    <TaskTable tasks={assignedTasks as any} isAdmin={true} users={users} />
                </div>
            </div>

        </div>
    )
}
