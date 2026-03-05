import { getClients, getTopClients } from '@/actions/crm-actions'
import { serializeDecimal } from '@/lib/serialization'
import ClientList from '@/components/crm/ClientList'
import CreateClientButton from '@/components/crm/CreateClientButton'
import UpdateScoresButton from '@/components/crm/UpdateScoresButton'

export default async function CRMDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params


    const [clientsRes, topClientsRes] = await Promise.all([
        getClients(workspaceId),
        getTopClients(workspaceId)
    ])

    const clients = clientsRes.data || []
    const topClients = topClientsRes.data || []

    // Type casting for UI component
    const typedClients = clients as any[]

    return (
        <div className="p-6">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                    Quản lý Khách hàng
                </h1>
                <p className="text-gray-400 mt-2">Hệ thống quản lý Đối tác, Brand con và Chỉ số Hiệu suất.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Client Tree & Management */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="glass-panel p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-white">Danh sách Khách hàng</h2>
                            <CreateClientButton partners={serializeDecimal(typedClients)} workspaceId={workspaceId} />
                        </div>

                        <ClientList clients={serializeDecimal(clients) as any} workspaceId={workspaceId} />
                    </section>
                </div>

                {/* Right Column: AI Insights & Quick Stats */}
                <div className="space-y-6">
                    <div className="glass-panel p-6 bg-gradient-to-br from-purple-900/40 to-blue-900/20">
                        <h3 className="text-lg font-bold text-purple-300 mb-2">🤖 AI Scoring System</h3>
                        <p className="text-sm text-gray-400">
                            Hệ thống chấm điểm dựa trên Doanh thu & Tần suất Feedback.
                            Chạy tự động mỗi 24h.
                        </p>

                        <UpdateScoresButton workspaceId={workspaceId} />

                        <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="text-xs text-gray-500 uppercase font-bold mb-3 tracking-wider">Top Khách hàng tiềm năng</div>

                            <div className="space-y-3">
                                {topClients.length > 0 ? topClients.map((client: any, i: number) => (
                                    <div key={client.id} className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/5 hover:bg-white/10 transition-colors group cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-500 text-black' :
                                                i === 1 ? 'bg-gray-400 text-black' :
                                                    i === 2 ? 'bg-orange-700 text-white' : 'bg-gray-800 text-gray-400'
                                                }`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-sm text-gray-200 group-hover:text-white">{client.name}</div>
                                                <div className="text-[10px] text-gray-500">{client.totalTaskCount} tasks</div>
                                            </div>
                                        </div>
                                        <div className="font-mono font-bold text-green-400 text-sm">
                                            {client.aiScore.toFixed(0)}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-sm text-gray-500 italic text-center py-2">Chưa có dữ liệu xếp hạng</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
