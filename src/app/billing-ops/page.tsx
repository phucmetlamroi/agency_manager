// [BILLING P7] /billing-ops — bàn điều khiển thu phí của CHỦ VELOX (global admin).
//
// Nằm NGOÀI cây [workspaceId] có chủ đích (kiểu /account/trash): dữ liệu ở đây là toàn
// hệ thống (code phát hành, tiền chưa khớp, subscription mọi tổ chức), không thuộc
// workspace nào. Cổng: User.role === 'ADMIN' toàn cục — trùng cổng requireGlobalAdmin
// của các action nó gọi, nên trang chỉ là lớp vỏ, action tự vệ được một mình.
import { redirect } from 'next/navigation'
import { verifyActiveSession } from '@/lib/security'
import BillingOpsPanel from '@/components/billing/BillingOpsPanel'

export const dynamic = 'force-dynamic'

export default async function BillingOpsPage() {
    const s = await verifyActiveSession()
    if (s.status !== 'active' || !s.dbUser) redirect('/login')
    if (s.dbUser.role !== 'ADMIN') redirect('/')

    return (
        <main className="min-h-screen bg-zinc-950 px-4 py-10 text-zinc-100">
            <div style={{ maxWidth: '1080px', margin: '0 auto' }}>
                <BillingOpsPanel />
            </div>
        </main>
    )
}
