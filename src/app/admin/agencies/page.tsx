import { getAllAgencies } from '@/actions/agency-actions'

export const dynamic = 'force-dynamic'

import { prisma } from '@/lib/db'
import CreateAgencyForm from '@/components/agencies/CreateAgencyForm'
import DeleteAgencyButton from '@/components/agencies/DeleteAgencyButton'

export default async function AgenciesPage() {
    const res = await getAllAgencies()
    const agencies = res.success ? res.data : []

    const users = await prisma.user.findMany({ select: { id: true, username: true, nickname: true }, orderBy: { username: 'asc' } })

    return (
        <div className="p-6 max-w-[1600px] mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Quản lý Đại Lý (Agencies)</h1>
                    <p className="text-gray-400 mt-1">Danh sách các đối tác nhượng quyền và đại lý.</p>
                </div>
                <CreateAgencyForm users={users} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* @ts-ignore */}
                {agencies?.map((agency) => (
                    <div key={agency.id} className="bg-[#1a1a1a] border border-white/5 rounded-2xl p-6 hover:border-blue-500/50 transition-all group relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-50 text-6xl font-black text-white/5 select-none pointer-events-none group-hover:text-blue-500/10 transition-colors">{agency.code}</div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-xl font-bold text-white group-hover:text-blue-400 transition-colors">{agency.name}</h3>
                                    <div className="inline-flex items-center gap-2 mt-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-mono">{agency.code}</div>
                                </div>
                                <div className={`px-2 py-1 rounded text-xs font-bold ${agency.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{agency.status}</div>
                                <div className="ml-2">
                                    <DeleteAgencyButton id={agency.id} name={agency.name} />
                                </div>
                            </div>
                            <div className="space-y-3 py-4 border-t border-white/5">
                                <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Chủ sở hữu</span><span className="text-white font-medium">{agency.owner ? (agency.owner.nickname || agency.owner.username) : <span className="text-gray-600 italic">Chưa có</span>}</span></div>
                                <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Nhân sự</span><span className="text-white font-medium">{agency._count?.members || 0} thành viên</span></div>
                                <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Tasks</span><span className="text-white font-medium">{agency._count?.tasks || 0} nhiệm vụ</span></div>
                            </div>
                        </div>
                    </div>
                ))}
                {agencies?.length === 0 && <div className="col-span-full py-20 text-center border border-dashed border-white/10 rounded-2xl bg-white/5"><p className="text-gray-500">Chưa có đại lý nào được tạo.</p></div>}
            </div>
        </div>
    )
}
