import { getClients } from '@/actions/crm-actions'
import ClientList from '@/components/crm/ClientList'

export default async function CRMDashboard() {
    const res = await getClients()
    const clients = res.data || []

    return (
        <div className="p-6">
            <header className="mb-8">
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                    CRM & Client Intelligence
                </h1>
                <p className="text-gray-400 mt-2">Quản lý Khách hàng, Dự án và Chỉ số Hiệu suất (AI Scoring)</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Client Tree & Management */}
                <div className="lg:col-span-2 space-y-6">
                    <section className="glass-panel p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-semibold text-white">Danh sách Khách hàng</h2>
                            {/* Add Button Placeholder - Componentize later */}
                        </div>

                        <ClientList clients={clients} />
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
                        <div className="mt-4 pt-4 border-t border-white/10">
                            <div className="text-xs text-gray-500 uppercase">Top Khách hàng tiềm năng</div>
                            {/* Placeholder for Top Clients */}
                            <div className="mt-2 text-sm text-gray-300 italic">Đang cập nhật dữ liệu...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
