import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function FinanceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()

    // Authorization Check
    // Must be Admin. Specific "Treasurer" check can be added if we strictly enforce it.
    // Spec says: "Chỉ hiển thị cho SUPER_ADMIN ("admin") và ADMIN có quyền xem tài chính."
    // We added `isTreasurer` to User model.

    const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { role: true, isTreasurer: true, username: true }
    })

    if (!user || user.role !== 'ADMIN') {
        redirect(`/${workspaceId}/admin`)
    }

    if (user.username !== 'admin' && !user.isTreasurer) {
        return (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                <h3>⛔ Quyền truy cập bị từ chối</h3>
                <p>Bạn không có quyền xem báo cáo tài chính. Vui lòng liên hệ Super Admin.</p>
            </div>
        )
    }

    // Fetch Financial Data (Completed Tasks Only)
    const tasks = await prisma.task.findMany({
        where: { status: 'Hoàn tất' },
        include: { assignee: true },
        orderBy: { updatedAt: 'desc' }
    })

    // Calculate Stats
    const totalRevenueVND = tasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)), 0)
    const totalWageVND = tasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const netProfit = totalRevenueVND - totalWageVND

    const profitMargin = totalRevenueVND > 0 ? (netProfit / totalRevenueVND) * 100 : 0

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            <h2 className="title-gradient" style={{ fontSize: '2rem', marginBottom: '2rem' }}>💰 Báo Cáo Tài Chính</h2>

            {/* Big Numbers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #60a5fa' }}>
                    <p style={{ color: '#888', margin: 0 }}>Tổng Doanh Thu (Gross)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#60a5fa' }}>
                        {totalRevenueVND.toLocaleString()} ₫
                    </h3>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Từ {tasks.length} tasks hoàn thành</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #ef4444' }}>
                    <p style={{ color: '#888', margin: 0 }}>Tổng Chi Phí (Wages)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#ef4444' }}>
                        {totalWageVND.toLocaleString()} ₫
                    </h3>
                    <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Chi trả cho nhân viên</div>
                </div>

                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
                    <p style={{ color: '#888', margin: 0 }}>Lợi Nhuận Ròng (Net)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0', color: '#10b981' }}>
                        {netProfit.toLocaleString()} ₫
                    </h3>
                    <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        color: profitMargin > 50 ? '#4ade80' : (profitMargin < 30 ? '#ef4444' : '#fbbf24')
                    }}>
                        Margin: {profitMargin.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Recent Transactions Table */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem', color: '#ccc' }}>Giao dịch gần đây</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #333', color: '#666' }}>
                            <th style={{ padding: '1rem' }}>Task</th>
                            <th style={{ padding: '1rem' }}>Người nhận</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Revenue (USD)</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Tỷ giá</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Revenue (VND)</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Wage</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Profit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tasks.slice(0, 20).map(t => {
                            const rev = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)
                            const wage = Number(t.wageVND || t.value || 0)
                            const prof = rev - wage

                            return (
                                <tr key={t.id} style={{ borderBottom: '1px solid #222' }}>
                                    <td style={{ padding: '1rem' }}>{t.title}</td>
                                    <td style={{ padding: '1rem' }}>{t.assignee?.username}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: '#60a5fa' }}>
                                        ${t.jobPriceUSD?.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: '#888' }}>
                                        {t.exchangeRate?.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                                        {rev.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: '#ef4444' }}>
                                        {wage.toLocaleString()}
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: '#10b981', fontWeight: 'bold' }}>
                                        {prof.toLocaleString()}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
