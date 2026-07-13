// [Giao diện 2 · Mission Control · M14 Quản lý hồ sơ thanh toán] Màn độc lập cho BillingProfileManager.
// M14 vốn là MODAL mở từ M13 ("Quản lý hồ sơ") — đã sống sẵn trong InvoiceModal ở /mc/hoa-don. Route này
// cho phép quản lý hồ sơ thanh toán TRỰC TIẾP (không cần chọn khách + tạo hóa đơn). Reuse nguyên
// BillingProfileManager (mount controlled-open). Admin-gated fail-closed; CRUD hồ sơ cổng ADMIN/verifyFinanceAccess.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import McBillingProfilesScreen from '@/components/mission-control/McBillingProfilesScreen'

export const dynamic = 'force-dynamic'

export default async function MissionControlBillingProfilesPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    return <McBillingProfilesScreen workspaceId={workspaceId} />
}
