// [Giao diện 2 · Mission Control · M7 Hộp thư yêu cầu] MC-shell wrapping the real RequestsInbox.
// Reuses getClientRequests + <RequestsInbox> (list · tạo task prefill · từ chối · Velox) — cùng
// logic /admin/requests, chỉ khoác vỏ Mission Control (rail + header dark). Admin-gated fail-closed.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { getClientRequests } from '@/actions/client-request-actions'
import RequestsInbox from '@/components/admin/RequestsInbox'
import McBackLink from '@/components/mission-control/McBackLink'
import { LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MissionControlRequestsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const requests = await getClientRequests(workspaceId)

    const rail: { icon: any; href?: string; active?: boolean; divider?: boolean }[] = [
        { icon: LayoutDashboard, href: `/${workspaceId}/mc` }, { icon: ListTodo, href: `/${workspaceId}/mc/queue` }, { icon: Inbox, active: true },
        { icon: Clapperboard, href: `/${workspaceId}/mc/tep` }, { icon: CalendarDays, href: `/${workspaceId}/mc/lich` }, { icon: Wallet, href: `/${workspaceId}/mc/tien`, divider: true }, { icon: Building2 },
    ]

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {rail.map((r, i) => {
                    const Icon = r.icon
                    const inner = (
                        <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.active ? '#A5B4FC' : '#A1A1AA', background: r.active ? 'rgba(99,102,241,0.18)' : 'transparent', border: r.active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: r.active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
                            <Icon style={{ width: 18, height: 18 }} />
                        </div>
                    )
                    return (
                        <div key={i} style={{ display: 'contents' }}>
                            {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                            {r.href ? <Link href={r.href}>{inner}</Link> : inner}
                        </div>
                    )
                })}
                <div style={{ flex: 1 }} />
                <McBackLink backHref={`/${workspaceId}/admin`} />
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,10,0.50)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Inbox style={{ width: 18, height: 18, color: '#A5B4FC' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F4F5' }}>Hộp thư yêu cầu</span>
                        <span style={{ fontSize: 11, color: '#A1A1AA' }}>Yêu cầu khách gửi qua portal — xem, tạo task (điền sẵn / Velox) hoặc từ chối.</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 999, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)' }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#A5B4FC' }}>{requests.length}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#A5B4FC' }}>Chờ xử lí</span>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 }}>
                    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
                        <RequestsInbox workspaceId={workspaceId} initialRequests={requests} />
                    </div>
                </div>
            </div>
        </div>
    )
}
