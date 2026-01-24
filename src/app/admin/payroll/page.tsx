import { prisma } from '@/lib/db'
import TaskTable from '@/components/TaskTable'

export default async function PayrollPage() {
    // 1. Determine Current Month Range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    // 2. Fetch Users and their COMPLETED tasks for this month
    const users = await prisma.user.findMany({
        where: { role: 'USER' }, // Only calculate for employees/users
        include: {
            tasks: {
                where: {
                    status: 'Hoàn tất', // Only completed tasks
                    updatedAt: {
                        gte: startOfMonth,
                        lte: endOfMonth
                    }
                },
                orderBy: { updatedAt: 'desc' },
                include: { assignee: true }
            }
        },
        orderBy: { username: 'asc' }
    })

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title-gradient" style={{ fontSize: '2rem', margin: 0 }}>💰 Bảng Lương & Thu Nhập</h2>
                    <p style={{ color: '#888', marginTop: '0.5rem' }}>
                        Tháng {now.getMonth() + 1}/{now.getFullYear()} • Tính trên các task đã "Hoàn tất".
                    </p>
                </div>
                <div style={{ background: '#333', padding: '0.5rem 1rem', borderRadius: '12px', color: '#ccc', fontSize: '0.9rem' }}>
                    📅 Kỳ lương hiện tại
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {users.map(user => {
                    // Calculate Total
                    const totalIncome = user.tasks.reduce((sum, task) => sum + task.value, 0)

                    return (
                        <div key={user.id} className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            {/* User Header */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: '1px solid #333', paddingBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', color: 'white'
                                    }}>
                                        {user.username.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{user.username}</h3>
                                        <span style={{ fontSize: '0.8rem', color: '#888' }}>ID: {user.id.slice(0, 8)}...</span>
                                    </div>
                                </div>

                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Tổng thu nhập tháng này</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                                        {totalIncome.toLocaleString()} VNĐ
                                    </div>
                                </div>
                            </div>

                            {/* Task List */}
                            <div>
                                {user.tasks.length > 0 ? (
                                    <>
                                        <h4 style={{ marginBottom: '1rem', color: '#ccc', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                            Danh sách công việc ({user.tasks.length})
                                        </h4>
                                        <TaskTable tasks={user.tasks as any} isAdmin={true} />
                                    </>
                                ) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                        Chưa có task hoàn tất trong tháng này.
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}

                {users.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>Không tìm thấy nhân viên nào.</div>
                )}
            </div>
        </div>
    )
}
