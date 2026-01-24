import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TaskTable from '@/components/TaskTable'

export default async function UserDashboard() {
    const session = await getSession()
    if (!session) redirect('/login')

    const userId = session.user.id

    const tasks = await prisma.task.findMany({
        where: { assigneeId: userId },
        orderBy: { createdAt: 'desc' }
    })

    // Payroll Calculation (Status "Hoàn tất" triggers payment)
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    // Filter logic
    const completedTasks = tasks.filter(t => t.status === 'Hoàn tất')

    const thisMonthTasks = completedTasks.filter(t => t.updatedAt >= thisMonthStart)
    const lastMonthTasks = completedTasks.filter(t => t.updatedAt >= lastMonthStart && t.updatedAt < thisMonthStart)

    const thisMonthSalary = thisMonthTasks.reduce((acc, t) => acc + t.value, 0)
    const lastMonthSalary = lastMonthTasks.reduce((acc, t) => acc + t.value, 0)

    let comparisonMsg = ''
    let percentage = 0
    let emoji = ''

    // Gamification Logic - Gen Z Style
    if (lastMonthSalary === 0) {
        if (thisMonthSalary > 0) {
            comparisonMsg = "Khởi đầu quá cháy! 🔥 Bạn đã bắt đầu kiếm tiền tháng này."
            emoji = "🚀"
        } else {
            comparisonMsg = "Chưa có lúa về. 🌾 Cày task mạnh lên nào homie!"
            emoji = "zzz"
        }
    } else {
        percentage = Math.round(((thisMonthSalary - lastMonthSalary) / lastMonthSalary) * 100)
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

    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

            {/* Analytics Cards - Gen Z Gradient */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div className="glass-panel" style={{ padding: '2rem', background: 'linear-gradient(135deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))' }}>
                    <h4 style={{ color: '#9ca3af', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem' }}>
                        LƯƠNG THÁNG NÀY (TẠM TÍNH) 💸
                    </h4>
                    <div style={{ fontSize: '2.5rem', fontWeight: '800', background: 'linear-gradient(to right, #4ade80, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        {thisMonthSalary.toLocaleString()} <span style={{ fontSize: '1.5rem', WebkitTextFillColor: '#22c55e' }}>đ</span>
                    </div>
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
            <TaskTable tasks={tasks as any} isAdmin={false} />

            {/* Change Password Section */}
            <div style={{ marginTop: '4rem', padding: '2rem', borderTop: '1px solid #333' }}>
                <h3 className="title-gradient" style={{ marginBottom: '1rem', fontSize: '1.2rem' }}>Đổi Mật Khẩu</h3>
                <form action={async (formData) => {
                    'use server'
                    const { changePassword } = await import('@/actions/user-actions')
                    await changePassword(formData)
                }} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                        name="newPassword"
                        type="password"
                        placeholder="Mật khẩu mới..."
                        required
                        minLength={6}
                        style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #333', background: '#222', color: 'white' }}
                    />
                    <button className="btn btn-primary" type="submit">Cập nhật</button>
                </form>
            </div>

        </div>
    )
}

