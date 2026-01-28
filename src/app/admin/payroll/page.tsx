import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import BonusCalculator from './BonusCalculator'

export default async function PayrollPage() {
    // 1. Determine Current Month Range
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // 2. Fetch Users and their COMPLETED tasks for this month
    const users = await prisma.user.findMany({
        where: {
            role: 'USER',
            username: { not: 'admin' }
        },
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
            },
            // Include bonuses for this month
            bonuses: {
                where: {
                    month: currentMonth,
                    year: currentYear
                }
            }
        },
        orderBy: { username: 'asc' }
    })

    // Filter out users with 0 income AND no bonus (active users only)
    const activeUsers = users.filter(user => user.tasks.length > 0 || user.bonuses.length > 0)

    // Check permission for "Calculate Bonus" button
    const session = await getSession()
    const currentUser = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { role: true, isTreasurer: true }
    })

    const canCalculateBonus = currentUser?.role === 'ADMIN' || currentUser?.isTreasurer

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <h2 className="title-gradient" style={{ fontSize: '2rem', margin: 0 }}>💰 Bảng Lương & Thu Nhập</h2>
                    <p style={{ color: '#888', marginTop: '0.5rem' }}>
                        Tháng {currentMonth}/{currentYear} • Tính trên các task đã "Hoàn tất".
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ background: '#333', padding: '0.5rem 1rem', borderRadius: '12px', color: '#ccc', fontSize: '0.9rem' }}>
                        📅 Kỳ lương hiện tại
                    </div>
                </div>
            </div>

            {canCalculateBonus && (
                <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <BonusCalculator />
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                {activeUsers.map(user => {
                    // Calculate Total Value from Tasks
                    const taskIncome = user.tasks.reduce((sum, task) => sum + task.value, 0)

                    // Get Bonus Data
                    const bonusData = user.bonuses[0]
                    const bonusAmount = bonusData ? bonusData.bonusAmount : 0
                    const totalIncome = taskIncome + bonusAmount

                    const rankEmoji = bonusData?.rank === 1 ? '🥇' : bonusData?.rank === 2 ? '🥈' : bonusData?.rank === 3 ? '🥉' : ''

                    return (
                        <div key={user.id} className="glass-panel" style={{ padding: '1.5rem', border: bonusData ? '1px solid #f59e0b' : '1px solid rgba(16, 185, 129, 0.2)', position: 'relative' }}>

                            {/* Rank Badge */}
                            {bonusData && (
                                <div style={{
                                    position: 'absolute', top: '-10px', right: '20px',
                                    background: '#f59e0b', color: 'black', fontWeight: 'bold',
                                    padding: '5px 15px', borderRadius: '20px',
                                    boxShadow: '0 4px 10px rgba(245, 158, 11, 0.4)',
                                    display: 'flex', alignItems: 'center', gap: '5px'
                                }}>
                                    {rankEmoji} Top {bonusData.rank}
                                </div>
                            )}

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
                                    <div style={{ fontSize: '0.9rem', color: '#aaa' }}>Tổng thực nhận</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                                        {totalIncome.toLocaleString()} VNĐ
                                    </div>
                                </div>
                            </div>

                            {/* Simple Task List Table */}
                            <div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid #333', color: '#888', textAlign: 'left' }}>
                                            <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500' }}>Hạng Mục</th>
                                            <th style={{ padding: '0.75rem 0.5rem', fontWeight: '500', textAlign: 'right' }}>Thành Tiền</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {user.tasks.map(task => (
                                            <tr key={task.id} style={{ borderBottom: '1px solid #222', color: '#e5e5e5' }}>
                                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                                    <div style={{ fontWeight: '500' }}>Task: {task.title}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                        {new Date(task.updatedAt).toLocaleDateString()}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', color: '#ccc' }}>
                                                    {task.value.toLocaleString()} đ
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Bonus Row */}
                                        {bonusData && (
                                            <tr style={{ background: 'rgba(245, 158, 11, 0.1)' }}>
                                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                                    <div style={{ fontWeight: 'bold', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {rankEmoji} Thưởng Top {bonusData.rank} Doanh Thu
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#f59e0b' }}>
                                                        (Doanh thu: {bonusData.revenue.toLocaleString()}đ • Tổng giờ: {bonusData.executionTimeHours.toFixed(1)}h)
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontFamily: 'monospace', fontSize: '1rem', color: '#f59e0b', fontWeight: 'bold' }}>
                                                    +{bonusData.bonusAmount.toLocaleString()} đ
                                                </td>
                                            </tr>
                                        )}

                                        <tr style={{ background: 'rgba(16, 185, 129, 0.05)', borderTop: '2px solid #333' }}>
                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#ccc' }}>
                                                Tổng cộng:
                                            </td>
                                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 'bold', color: '#10b981', fontSize: '1.2rem' }}>
                                                {totalIncome.toLocaleString()} đ
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
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
