import { prisma } from '@/lib/db'
import { createTask, deleteTask } from '@/actions/admin-actions'
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

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>

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
                            <label style={{ fontSize: '0.8rem', color: '#888' }}>Deadline</label>
                            <input name="deadline" type="date"
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
                        <select name="assigneeId" required
                            style={{ width: '100%', padding: '0.5rem', background: '#222', border: '1px solid #333', color: 'white', borderRadius: '6px' }}>
                            <option value="">-- Chọn nhân viên --</option>
                            {users.map(u => (
                                <option key={u.id} value={u.id}>{u.username}</option>
                            ))}
                        </select>
                    </div>

                    <button className="btn btn-primary" type="submit">Tạo Task</button>
                </form>
            </div>

            {/* Task List */}
            <div>
                <h3 style={{ marginBottom: '1rem' }}>Danh sách công việc ({tasks.length})</h3>
                <TaskTable tasks={tasks as any} isAdmin={true} />
            </div>

        </div>
    )
}
