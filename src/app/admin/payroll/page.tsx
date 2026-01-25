import { prisma } from '@/lib/db'
import DeleteTaskButton from '@/components/DeleteTaskButton'

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

    // Filter out users with 0 income (no completed tasks in this period)
    const activeUsers = users.filter(user => user.tasks.length > 0)

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
                {activeUsers.map(user => {
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

                            {/* Simple Task List Table */}
                            <div>
                                {user.tasks.length > 0 ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                                                <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500' }}>Tên Công Việc / Khách Hàng</th>
                                                <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500', textAlign: 'right' }}>Thành Tiền</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {user.tasks.map(task => (
                                                <tr key={task.id} style={{ borderBottom: '1px solid #222', color: '#e5e5e5' }}>
                                                    <td style={{ padding: '0.75rem 0.5rem' }}>
                                                        <div style={{ fontWeight: '500' }}>{task.title}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                            {new Date(task.updatedAt).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', color: '#10b981' }}>
                                                        {task.value.toLocaleString()} đ
                                                    </td>
                                                </tr>
                                            ))}
                                            <tr style={{ background: 'rgba(16, 185, 129, 0.05)' }}>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#ccc' }}>
                                                    Tổng cộng:
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981', fontSize: '1.1rem' }}>
                                                    {totalIncome.toLocaleString()} đ
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                ) : (
                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#666', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                        Chưa có task hoàn tất trong tháng này.
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}

                {activeUsers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
                        Không có số liệu lương trong tháng này.
                    </div>
                )}
            </div>
        </div>
    )
}
