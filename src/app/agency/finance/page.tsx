import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AgencyFinancePage() {
    const session = await getSession()
    if (!session) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { ownedAgency: true }
    })

    const agencyId = user?.ownedAgency[0]?.id
    if (!agencyId) redirect('/dashboard')

    // Fetch Completed Tasks for Finance Stats
    const tasks = await prisma.task.findMany({
        where: {
            assignedAgencyId: agencyId,
            status: 'Hoàn tất'
        },
        select: {
            id: true,
            title: true,
            jobPriceUSD: true,
            value: true, // Wage in VND
            updatedAt: true,
            assignee: { select: { username: true } }
        },
        orderBy: { updatedAt: 'desc' },
        take: 100 // Limit for now
    })

    const totalRevenueVND = tasks.reduce((acc, t) => acc + (t.value || 0), 0) // "Value" field is usually payment to staff? 
    // Wait, in Task model:
    // jobPriceUSD = Revenue from Client
    // value (wageVND) = Payment to Staff
    // But for AGENCY model:
    // Does the Agency get a cut? Or is the Agency just an aggregator?
    // Let's assume:
    // Agency Revenue = Sum of Task Wages provided by Super Admin? 
    // OR Super Admin pays Agency, Agency pays User?
    // Current Model: Super Admin sets 'wageVND' (value).
    // Let's display 'Total Value Assigned' as Revenue for now.

    const totalTaskValue = tasks.reduce((acc, t) => acc + (t.value || 0), 0)

    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
                Tài Chính Đại Lý (Agency Finance)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="p-6 bg-[#1a1a1a] border border-white/5 rounded-2xl">
                    <p className="text-gray-500 text-sm mb-2">Tổng Giá Trị Task (Hoàn tất)</p>
                    <h3 className="text-3xl font-bold text-green-400">{totalTaskValue.toLocaleString()} đ</h3>
                    <p className="text-xs text-gray-600 mt-2">* Tổng số tiền công task đã hoàn thành</p>
                </div>
                {/* Add more stats later */}
            </div>

            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 font-bold text-gray-400 uppercase text-xs">
                    Lịch sử dòng tiền (Tasks)
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-white/5 text-gray-400">
                        <tr>
                            <th className="p-3">Task</th>
                            <th className="p-3">Hoàn thành</th>
                            <th className="p-3">Thực hiện</th>
                            <th className="p-3 text-right">Giá trị (VNĐ)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {tasks.map(t => (
                            <tr key={t.id} className="hover:bg-white/5">
                                <td className="p-3 font-medium text-white">{t.title}</td>
                                <td className="p-3 text-gray-500">{new Date(t.updatedAt).toLocaleDateString('vi-VN')}</td>
                                <td className="p-3 text-blue-400">{t.assignee?.username || 'Agency'}</td>
                                <td className="p-3 text-right font-mono text-green-400 font-bold">
                                    +{t.value?.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {tasks.length === 0 && (
                    <div className="p-8 text-center text-gray-500">Chưa có dữ liệu tài chính.</div>
                )}
            </div>
        </div>
    )
}
