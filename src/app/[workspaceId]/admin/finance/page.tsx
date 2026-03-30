import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

export default async function FinanceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    const profileId = (session?.user as any)?.sessionProfileId
    const workspacePrisma = getWorkspacePrisma(workspaceId, profileId)

    // Authorization Check
    // Must be Admin. Specific "Treasurer" check can be added if we strictly enforce it.
    // Spec says: "Chỉ hiển thị cho SUPER_ADMIN ("admin") và ADMIN có quyền xem tài chính."
    // We added `isTreasurer` to User model.

    const user = await workspacePrisma.user.findUnique({
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
    const tasks = await workspacePrisma.task.findMany({
        where: { status: 'Hoàn tất' },
        include: {
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // Fetch ALL tasks (for projected/expected numbers)
    const allTasks = await workspacePrisma.task.findMany({
        where: { isArchived: false },
        include: {
            assignee: {
                select: {
                    id: true,
                    username: true,
                    role: true,
                    nickname: true
                }
            }
        },
        orderBy: { updatedAt: 'desc' }
    })

    // ── Actual (Completed only) ──
    const totalRevenueVND = tasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)), 0)
    const totalWageVND = tasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const netProfit = totalRevenueVND - totalWageVND
    const profitMargin = totalRevenueVND > 0 ? (netProfit / totalRevenueVND) * 100 : 0

    // ── Projected (ALL tasks) ──
    const projectedRevenueVND = allTasks.reduce((sum, t) => sum + (Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)), 0)
    const projectedWageVND = allTasks.reduce((sum, t) => sum + Number(t.wageVND || t.value || 0), 0)
    const projectedNetProfit = projectedRevenueVND - projectedWageVND
    const projectedMargin = projectedRevenueVND > 0 ? (projectedNetProfit / projectedRevenueVND) * 100 : 0
    const pendingTasksCount = allTasks.length - tasks.length

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
            <h2 className="title-gradient" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>💰 Báo Cáo Tài Chính</h2>
            <p style={{ color: '#666', marginBottom: '2rem', fontSize: '0.9rem' }}>
                ✅ <strong>Thực tế</strong>: từ {tasks.length} task hoàn thành &nbsp;|&nbsp; 
                🔮 <strong>Dự kiến</strong>: từ toàn bộ {allTasks.length} task ({pendingTasksCount} đang chạy)
            </p>

            {/* Big Numbers — Actual vs Projected side by side */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

                {/* Revenue */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #60a5fa' }}>
                    <p style={{ color: '#888', margin: 0, fontSize: '0.85rem' }}>Tổng Doanh Thu (Gross)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0 0.25rem', color: '#60a5fa' }}>
                        {totalRevenueVND.toLocaleString()} ₫
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.75rem' }}>Từ {tasks.length} tasks hoàn thành</div>
                    <div style={{ borderTop: '1px solid #2a3a5a', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6366f1', marginBottom: '2px' }}>🔮 Dự kiến (tất cả tasks)</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#818cf8' }}>
                            {projectedRevenueVND.toLocaleString()} ₫
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4c4f74' }}>
                            +{(projectedRevenueVND - totalRevenueVND).toLocaleString()} ₫ đang chờ
                        </div>
                    </div>
                </div>

                {/* Cost */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #ef4444' }}>
                    <p style={{ color: '#888', margin: 0, fontSize: '0.85rem' }}>Tổng Chi Phí (Wages)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0 0.25rem', color: '#ef4444' }}>
                        {totalWageVND.toLocaleString()} ₫
                    </h3>
                    <div style={{ fontSize: '0.8rem', color: '#555', marginBottom: '0.75rem' }}>Chi trả cho nhân viên</div>
                    <div style={{ borderTop: '1px solid #3a2a2a', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#f87171', marginBottom: '2px' }}>🔮 Dự kiến (tất cả tasks)</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#fca5a5' }}>
                            {projectedWageVND.toLocaleString()} ₫
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#6b3a3a' }}>
                            +{(projectedWageVND - totalWageVND).toLocaleString()} ₫ sẽ phải trả
                        </div>
                    </div>
                </div>

                {/* Profit */}
                <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid #10b981' }}>
                    <p style={{ color: '#888', margin: 0, fontSize: '0.85rem' }}>Lợi Nhuận Ròng (Net)</p>
                    <h3 style={{ fontSize: '2rem', margin: '0.5rem 0 0.25rem', color: '#10b981' }}>
                        {netProfit.toLocaleString()} ₫
                    </h3>
                    <div style={{
                        fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '0.75rem',
                        color: profitMargin > 50 ? '#4ade80' : (profitMargin < 30 ? '#ef4444' : '#fbbf24')
                    }}>
                        Margin: {profitMargin.toFixed(1)}%
                    </div>
                    <div style={{ borderTop: '1px solid #1a3a2a', paddingTop: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#34d399', marginBottom: '2px' }}>🔮 Dự kiến (tất cả tasks)</div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#6ee7b7' }}>
                            {projectedNetProfit.toLocaleString()} ₫
                        </div>
                        <div style={{
                            fontSize: '0.8rem', fontWeight: '600',
                            color: projectedMargin > 50 ? '#4ade80' : (projectedMargin < 30 ? '#ef4444' : '#fbbf24')
                        }}>
                            Margin dự kiến: {projectedMargin.toFixed(1)}%
                        </div>
                    </div>
                </div>
            </div>

            {/* Projected Summary Banner */}
            <div className="glass-panel" style={{
                padding: '1rem 1.5rem', marginBottom: '2rem',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(16,185,129,0.08))',
                border: '1px solid rgba(99,102,241,0.3)',
                display: 'flex', gap: '3rem', flexWrap: 'wrap', alignItems: 'center'
            }}>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#6366f1', textTransform: 'uppercase', letterSpacing: '1px' }}>Tổng DT Dự Kiến</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#818cf8' }}>{projectedRevenueVND.toLocaleString()} ₫</div>
                </div>
                <div style={{ color: '#333', fontSize: '1.5rem' }}>−</div>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#f87171', textTransform: 'uppercase', letterSpacing: '1px' }}>Tổng CP Dự Kiến</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fca5a5' }}>{projectedWageVND.toLocaleString()} ₫</div>
                </div>
                <div style={{ color: '#333', fontSize: '1.5rem' }}>=</div>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#34d399', textTransform: 'uppercase', letterSpacing: '1px' }}>LN Ròng Dự Kiến</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6ee7b7' }}>{projectedNetProfit.toLocaleString()} ₫</div>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: '0.75rem', color: '#888' }}>Margin dự kiến</div>
                    <div style={{
                        fontSize: '1.8rem', fontWeight: 'bold',
                        color: projectedMargin > 50 ? '#4ade80' : (projectedMargin < 30 ? '#ef4444' : '#fbbf24')
                    }}>
                        {projectedMargin.toFixed(1)}%
                    </div>
                </div>
            </div>

            {/* Recent Transactions Table — Showing both Actual & Projected */}
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ marginBottom: '1.5rem', color: '#ccc', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    📊 Nhật ký Giao dịch 
                    <span style={{ fontSize: '0.7rem', color: '#666', fontWeight: 'normal' }}>(Hiển thị cả thực tế & dự kiến)</span>
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #333', color: '#666' }}>
                            <th style={{ padding: '1rem' }}>Task & Trạng thái</th>
                            <th style={{ padding: '1rem' }}>Người nhận</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Dự kiến Revenue (VND)</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Dự kiến Wage</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>LN Ròng</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allTasks.slice(0, 50).map(t => {
                            const rev = Number(t.jobPriceUSD || 0) * Number(t.exchangeRate || 25300)
                            const wage = Number(t.wageVND || t.value || 0)
                            const prof = rev - wage
                            const isCompleted = t.status === 'Hoàn tất'

                            return (
                                <tr key={t.id} style={{ 
                                    borderBottom: '1px solid #222',
                                    opacity: isCompleted ? 1 : 0.7,
                                    background: isCompleted ? 'transparent' : 'rgba(99,102,241,0.03)'
                                }}>
                                    <td style={{ padding: '1rem' }}>
                                        <div style={{ fontWeight: '500', color: isCompleted ? '#fff' : '#aaa' }}>{t.title}</div>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px',
                                                background: isCompleted ? 'rgba(16,185,129,0.1)' : 'rgba(99,102,241,0.1)',
                                                color: isCompleted ? '#4ade80' : '#818cf8',
                                                border: `1px solid ${isCompleted ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.3)'}`
                                            }}>
                                                {isCompleted ? '✅ THỰC TẾ' : '🔮 DỰ KIẾN'}
                                            </span>
                                            <span style={{ fontSize: '0.65rem', color: '#555' }}>• {t.status}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', color: '#888' }}>{t.assignee?.username || '—'}</td>
                                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 'bold' }}>
                                        {rev.toLocaleString()} ₫
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: isCompleted ? '#ef4444' : '#fca5a5' }}>
                                        {wage.toLocaleString()} ₫
                                    </td>
                                    <td style={{ padding: '1rem', textAlign: 'right', color: isCompleted ? '#10b981' : '#6ee7b7', fontWeight: 'bold' }}>
                                        {prof.toLocaleString()} ₫
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
