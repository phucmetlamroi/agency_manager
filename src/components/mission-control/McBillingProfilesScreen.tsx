'use client'
// [Giao diện 2 · Mission Control · M14 Quản lý hồ sơ thanh toán] Màn độc lập bọc BillingProfileManager
// (list ⇄ form tạo/sửa) — đúng modal M14 (mở từ nút "Quản lý hồ sơ" ở M13). Mount ở chế độ controlled-open
// + hideTrigger để hiện thẳng như 1 màn (không cần đi qua luồng tạo hóa đơn). BillingProfileManager tự
// hydrate getBillingProfiles + CRUD (create/update/deleteBillingProfile) — 0 rủi ro logic. Đóng → /mc/hoa-don.
import { useRouter } from 'next/navigation'
import BillingProfileManager from '@/components/invoice/BillingProfileManager'

export default function McBillingProfilesScreen({ workspaceId }: { workspaceId: string }) {
    const router = useRouter()
    const back = () => router.push(`/${workspaceId}/mc/hoa-don`)

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(37,99,235,0.10), transparent 60%)', pointerEvents: 'none' }} />
            <BillingProfileManager
                workspaceId={workspaceId}
                open
                onOpenChange={(o) => { if (!o) back() }}
                hideTrigger
            />
        </div>
    )
}
