import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AgencyMembersPage() {
    const session = await getSession()
    if (!session) redirect('/login')

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { ownedAgency: true }
    })

    const agencyId = user?.ownedAgency[0]?.id
    if (!agencyId) redirect('/dashboard')

    const members = await prisma.user.findMany({
        where: { agencyId: agencyId },
        include: {
            _count: {
                select: { tasks: { where: { status: { not: 'Hoàn tất' } } } } // Count active tasks
            }
        },
        orderBy: { username: 'asc' }
    })

    return (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                Nhân sự Đại lý
            </h2>

            <div className="bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 text-gray-400 text-sm uppercase">
                            <th className="p-4 font-bold">Thành viên</th>
                            <th className="p-4 font-bold">Role</th>
                            <th className="p-4 font-bold">Active Tasks</th>
                            <th className="p-4 font-bold">Reputation</th>
                            <th className="p-4 font-bold">Liên hệ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {members.map(m => (
                            <tr key={m.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4">
                                    <div className="flex flex-col">
                                        <span className="font-bold text-white">{m.nickname || m.username}</span>
                                        <span className="text-xs text-gray-500">@{m.username}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${m.id === user.id ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-800 text-gray-400'}`}>
                                        {m.id === user.id ? 'YOU (Admin)' : 'Member'}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <span className="font-mono text-blue-400 font-bold">{m._count.tasks}</span>
                                </td>
                                <td className="p-4 text-yellow-500 font-bold">
                                    {m.reputation ?? 100}đ
                                </td>
                                <td className="p-4 text-sm text-gray-400">
                                    {m.email || 'N/A'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {members.length === 0 && (
                    <div className="p-8 text-center text-gray-500 italic">
                        Chưa có thành viên nào trong đại lý.
                    </div>
                )}
            </div>

            <div className="mt-4 text-sm text-gray-500">
                * Việc thêm/xóa thành viên hiện tại do System Admin thực hiện.
            </div>
        </div>
    )
}
