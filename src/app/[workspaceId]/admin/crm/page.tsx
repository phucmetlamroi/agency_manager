import { getClients } from '@/actions/crm-actions'
import { serializeDecimal } from '@/lib/serialization'
import ClientList from '@/components/crm/ClientList'
import MobileClientList from '@/components/crm/MobileClientList'
import CreateClientButton from '@/components/crm/CreateClientButton'
import { isMobileDevice } from '@/lib/device'
import Link from 'next/link'
import { Building2, Users, Trash2 } from 'lucide-react'

export default async function CRMDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params

    const clientsRes = await getClients(workspaceId)
    const clients = clientsRes.data || []

    // Type casting for UI component
    const typedClients = clients as any[]
    const clientCount = typedClients.length

    // [Mobile P4 / M7 — QĐ-1 tầng 2] Dispatcher UA: mobile → card list; desktop giữ
    // bảng 6 cột ClientList.tsx NGUYÊN VẸN (nhánh return bên dưới không đổi 1 byte).
    if (await isMobileDevice()) {
        return <MobileClientList clients={serializeDecimal(clients) as any} workspaceId={workspaceId} />
    }

    return (
        <div className="px-3 py-4 sm:px-7 sm:py-6">
            {/* ── Page Header ── */}
            <header className="flex flex-col gap-3 mb-5 sm:flex-row sm:items-start sm:justify-between sm:mb-7">
                {/* Left side */}
                <div className="flex items-start gap-3 sm:gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary-accent" />
                    </div>
                    <div>
                        <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight leading-tight m-0">
                            Quản lý Khách hàng
                        </h1>
                        <p className="text-xs text-muted-foreground mt-1 m-0">
                            Hệ thống quản lý Đối tác, Brand con và Chỉ số Hiệu suất.
                        </p>
                    </div>
                </div>

                {/* Right side - Trash link + Count badge */}
                <div className="self-start sm:self-auto flex items-center gap-2">
                    <Link
                        href={`/${workspaceId}/admin/client-trash`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/60 hover:bg-zinc-700/60 border border-white/8 text-[12px] text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" /> Thùng rác
                    </Link>
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/12 border border-primary/25">
                        <span className="text-lg font-bold text-primary-accent">
                            {clientCount}
                        </span>
                        <span className="text-[11px] text-primary-accent font-medium">
                            Khách hàng
                        </span>
                    </div>
                </div>
            </header>

            {/* ── Table Card ── */}
            <div className="rounded-2xl bg-zinc-900 border border-white/8 shadow-xl shadow-black/30 overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4 border-b border-white/5">
                    <div className="flex items-center gap-2 min-w-0">
                        <Users className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-bold text-white truncate">
                            Danh sách Khách hàng
                        </span>
                    </div>
                    <CreateClientButton partners={serializeDecimal(typedClients)} workspaceId={workspaceId} />
                </div>

                {/* Client list */}
                <ClientList clients={serializeDecimal(clients) as any} workspaceId={workspaceId} />
            </div>
        </div>
    )
}
