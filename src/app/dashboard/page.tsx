import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'
import { isMobileDevice } from '@/lib/device'
import DraggableFocusWidget from '@/components/DraggableFocusWidget'

export default async function UserDashboard() {
    const session = await getSession()
    if (!session) redirect('/login')

    const userId = session.user.id
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()

    // Fetch Tasks & Bonus in parallel or single query pattern
    // Fetch user to get bonus
    const userWithBonus = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            bonuses: {
                where: {
                    month: currentMonth,
                    year: currentYear
                }
            }
        }
    })

    // Redirect Agency Admin to Agency Portal
    if (userWithBonus?.role === 'AGENCY_ADMIN') {
        redirect('/agency')
    }

    const tasks = await prisma.task.findMany({
        where: { assigneeId: userId },
        include: { client: { include: { parent: true } } },
        orderBy: { createdAt: 'desc' }
    })

    // Payroll Calculation (Status "Hoàn tất" triggers payment)
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Filter logic
    const completedTasks = tasks.filter(t => t.status === 'Hoàn tất')

    const thisMonthTasks = completedTasks.filter(t => t.updatedAt >= thisMonthStart)
    const lastMonthTasks = completedTasks.filter(t => t.updatedAt >= lastMonthStart && t.updatedAt < thisMonthStart)

    const baseSalary = thisMonthTasks.reduce((acc, t) => acc + t.value, 0)
    const lastMonthSalary = lastMonthTasks.reduce((acc, t) => acc + t.value, 0)

    // Add Bonus to this month
    const bonusData = userWithBonus?.bonuses[0]
    const bonusAmount = bonusData ? bonusData.bonusAmount : 0
    const totalThisMonthSalary = baseSalary + bonusAmount

    let comparisonMsg = ''
    let percentage = 0
    let emoji = ''

    // Gamification Logic - Gen Z Style
    // Use totalThisMonthSalary for comparison? Spec says bonus is added to "Tổng thực nhận". 
    // Usually analytics track growth, so including bonus makes sense for "Total Income".

    if (lastMonthSalary === 0) {
        if (totalThisMonthSalary > 0) {
            comparisonMsg = "Khởi đầu quá cháy! 🔥 Bạn đã bắt đầu kiếm tiền tháng này."
            emoji = "🚀"
        } else {
            comparisonMsg = "Chưa có lúa về. 🌾 Cày task mạnh lên nào homie!"
            emoji = "zzz"
        }
    } else {
        percentage = Math.round(((totalThisMonthSalary - lastMonthSalary) / lastMonthSalary) * 100)
        if (percentage > 0) {
            comparisonMsg = `Tuyệt vời! Bạn đang bay cao ✈️, sếp sắp mời trà sữa rồi! (+${percentage}%)`
            emoji = "🎉"
        } else if (percentage < 0) {
            comparisonMsg = `Cố lên chiến binh 🛡️, tháng sau phục thù nhé! (Đang thấp hơn ${Math.abs(percentage)}%)`
            emoji = "💪"
        } else {
            comparisonMsg = "Phong độ ổn định như bê tông cốt thép. 🏗️ Tiếp tục nỗ lực nhé!"
            emoji = "🧱"
        }
    }

    const rankEmoji = bonusData?.rank === 1 ? '🥇' : bonusData?.rank === 2 ? '🥈' : bonusData?.rank === 3 ? '🥉' : ''

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

            {/* Analytics Cards - Gen Z Gradient */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div className="glass-panel" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))', position: 'relative' }}>
                    <h4 style={{ color: '#9ca3af', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>
                        LƯƠNG THÁNG NÀY (TẠM TÍNH) 💸
                    </h4>

                    {bonusData && (
                        <div style={{
                            position: 'absolute', top: '15px', right: '15px',
                            background: '#f59e0b', color: 'black', fontWeight: 'bold', fontSize: '0.8rem',
                            padding: '4px 10px', borderRadius: '12px'
                        }}>
                            {rankEmoji} Top {bonusData.rank}
                        </div>
                    )}

                    <div style={{ fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(to right, #4ade80, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {totalThisMonthSalary.toLocaleString()} <span style={{ fontSize: '1.5rem', WebkitTextFillColor: '#22c55e' }}>đ</span>
                    </div>

                    {bonusData && (
                        <div style={{ fontSize: '0.9rem', color: '#f59e0b', marginTop: '0.5rem', fontWeight: '500' }}>
                            (Đã bao gồm thưởng: +{bonusAmount.toLocaleString()}đ)
                        </div>
                    )}

                    <div style={{ marginTop: '1rem', display: 'inline-block', padding: '0.3rem 0.8rem', borderRadius: '20px', background: percentage >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: percentage >= 0 ? '#22c55e' : '#ef4444', fontSize: '0.9rem', fontWeight: 'bold' }}>
                        {percentage > 0 && '▲'} {percentage < 0 && '▼'} {Math.abs(percentage)}% so với tháng trước
                    </div>
                </div>

                <div className="glass-panel" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.15), rgba(236, 72, 153, 0.15))', border: '1px solid rgba(168, 85, 247, 0.3)' }}>
                    <h4 style={{ color: '#e9d5ff', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>
                        LỜI NHẮN VŨ TRỤ 🌌
                    </h4>
                    <div style={{ fontSize: '1.25rem', lineHeight: '1.6', fontWeight: '500', color: '#fff' }}>
                        <span style={{ fontSize: '2rem', marginRight: '0.5rem' }}>{emoji}</span>
                        {comparisonMsg}
                    </div>
                </div>
            </div>

            <h3 className="title-gradient" style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Danh sách Task của tôi</h3>

            {/* Using the new TaskTable for User too, but restrict Admin controls */}
            <TaskTable tasks={tasks as any} isAdmin={false} isMobile={await isMobileDevice()} />

            {/* Draggable Focus Widget */}
            <DraggableFocusWidget userId={userId} />
        </div>
    )
}
