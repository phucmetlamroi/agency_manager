// [Giao diện 2 · Mission Control · M28 Phân tích hiệu suất] MC-shell wrapping the real analytics
// surface: AnalyticsTable (rank S–D theo tỉ lệ lỗi · task hoàn tất · tổng phạt VND · TanStack grid)
// + LivePresenceBoard (đang trực tuyến — heartbeat 5' + nút impersonate). Same server action
// getAnalyticsData (ADMIN-gated, VND-only — KHÔNG jobPriceUSD). Admin-gated fail-closed;
// /admin/analytics byte-identical.
// NOTES (GĐ1 follow-ups, ngoài scope port — bàn giao dev, KHÔNG sửa backend/logic ở đây):
//   1. Drill-down "Hồ sơ vi phạm" (getUserErrorDetails/…PerformanceScore/…ErrorLogsDetail) gate
//      `!isGlobalAdmin && user.id !== userId` NHƯNG verifyWorkspaceAccess luôn trả isGlobalAdmin=false
//      (security.ts) → admin xem người KHÁC nhận []/null. Panel row-expand trắng cho đa số admin —
//      lỗi CÓ SẴN trên /admin/analytics, tái dùng y nguyên (byte-identical). Fix = gate theo
//      workspaceRole∈{OWNER,ADMIN}. Không sửa ở đây (đụng authz backend).
//   2. Banner impersonate được wire ở /admin LAYOUT, không phải page → không tự có dưới /mc.
//      Nút impersonate trong LivePresenceBoard vẫn chạy (startImpersonation hardened + redirect);
//      chỉ thiếu dải "đang xem dưới quyền" ở /mc. Follow-up: thêm banner vào shell MC nếu cần.
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { getAnalyticsData } from '@/actions/analytics-actions'
import AnalyticsTable from '@/components/admin/analytics/AnalyticsTable'
import LivePresenceBoard from '@/components/admin/analytics/LivePresenceBoard'
import McShell from '@/components/mission-control/McShell'

export const dynamic = 'force-dynamic'

export default async function MissionControlAnalyticsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const analyticsData = await getAnalyticsData(workspaceId)

    return (
        <McShell workspaceId={workspaceId} active="analytics">
            <div style={{ maxWidth: 1700, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#F4F4F5', letterSpacing: '-0.01em' }}>Phân tích hiệu suất</h1>
                        <p style={{ fontSize: 13, color: '#A1A1AA', marginTop: 4 }}>Xếp hạng nhân sự S–D theo tỉ lệ lỗi · task hoàn tất · tổng phạt (₫) · gamification.</p>
                    </div>
                    <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, color: '#D4D4D8', background: 'rgba(24,24,27,0.7)', padding: '10px 18px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                        Tổng nhân sự đánh giá: <strong style={{ color: '#A5B4FC' }}>{analyticsData.length}</strong>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-4 gap-6" style={{ minHeight: 500 }}>
                    <div className="xl:col-span-3" style={{ minHeight: 500 }}>
                        <AnalyticsTable data={analyticsData} workspaceId={workspaceId} />
                    </div>
                    <div className="xl:col-span-1" style={{ minHeight: 500 }}>
                        <LivePresenceBoard />
                    </div>
                </div>
            </div>
        </McShell>
    )
}
