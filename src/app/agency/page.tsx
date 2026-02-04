import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Activity, Users, FileText, DollarSign } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AgencyDashboard() {
    const session = await getSession()
    if (!session) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { ownedAgency: true }
    })

    const agencyId = user?.ownedAgency[0]?.id
    if (!agencyId) return <div>Unauthorized</div>

    // Metrics
    const taskCount = await prisma.task.count({ where: { assignedAgencyId: agencyId } })
    const pendingTasks = await prisma.task.count({ where: { assignedAgencyId: agencyId, status: 'Đang đợi giao' } })
    const activeTasks = await prisma.task.count({ where: { assignedAgencyId: agencyId, status: 'Đang thực hiện' } })
    const memberCount = await prisma.user.count({ where: { agencyId: agencyId } })

    const stats = [
        { label: 'Tổng số Task', value: taskCount, icon: <FileText className="text-blue-400" />, color: 'border-blue-500/20 bg-blue-500/5' },
        { label: 'Chờ giao việc', value: pendingTasks, icon: <Activity className="text-orange-400" />, color: 'border-orange-500/20 bg-orange-500/5' },
        { label: 'Đang thực hiện', value: activeTasks, icon: <Activity className="text-green-400" />, color: 'border-green-500/20 bg-green-500/5' },
        { label: 'Nhân sự', value: memberCount, icon: <Users className="text-purple-400" />, color: 'border-purple-500/20 bg-purple-500/5' },
    ]

    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Tổng Quan Đại Lý
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat, i) => (
                    <div key={i} className={`p-6 rounded-2xl border ${stat.color} backdrop-blur-sm`}>
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-white/5 rounded-xl">
                                {stat.icon}
                            </div>
                            <span className="text-3xl font-bold text-white">{stat.value}</span>
                        </div>
                        <p className="text-sm text-gray-400 font-medium">{stat.label}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Tasks */}
                <div className="p-6 rounded-2xl border border-white/5 bg-[#151515]">
                    <h3 className="text-lg font-bold mb-4 text-white">Task Mới Nhận</h3>
                    {/* Placeholder List */}
                    <div className="space-y-3">
                        <p className="text-gray-500 text-sm italic">Danh sách hiển thị sau...</p>
                    </div>
                </div>

                {/* Team Activity */}
                <div className="p-6 rounded-2xl border border-white/5 bg-[#151515]">
                    <h3 className="text-lg font-bold mb-4 text-white">Hoạt động thành viên</h3>
                    <div className="space-y-3">
                        <p className="text-gray-500 text-sm italic">Chưa có dữ liệu.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
