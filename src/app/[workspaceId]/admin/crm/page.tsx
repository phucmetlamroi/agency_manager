import { getClients } from '@/actions/crm-actions'
import { serializeDecimal } from '@/lib/serialization'
import ClientList from '@/components/crm/ClientList'
import CreateClientButton from '@/components/crm/CreateClientButton'
export default async function CRMDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params


    const clientsRes = await getClients(workspaceId)
    const clients = clientsRes.data || []

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

            <div className="space-y-6">
                <section className="glass-panel p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-semibold text-white">Danh sách Khách hàng</h2>
                        <CreateClientButton partners={serializeDecimal(typedClients)} workspaceId={workspaceId} />
                    </div>

                    <ClientList clients={serializeDecimal(clients) as any} workspaceId={workspaceId} />
                </section>
            </div>
        </div>
    )
}
