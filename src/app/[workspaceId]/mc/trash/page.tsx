// [Giao diện 2 · Mission Control · M26 Thùng rác hợp nhất] MC-shell wrapping the unified 4-tab trash hub.
// The design (Màn 26, "đã duyệt gộp") merges the four EXISTING trash surfaces into one screen, each tab
// keeping its own action/route: Tệp (=Màn 22 TeamTrash) · Khách (ClientTrash) · Task đã hủy (CancelledTasks)
// · Tổ chức (ProfileTrash, OWNER-only). This route now SUBSUMES the old Files-only /mc/trash (M22) — Tệp is
// tab 1. Data for tabs 2/3/4 is fetched here via admin/owner-gated actions; the Tệp tab self-fetches.
// Admin-gated fail-closed (nhất quán mọi route /mc/*). Money-safe: client-trash DTO = counts only (không
// jobPriceUSD); getMyTrashedProfiles tự lọc OWNER; mọi restore/purge re-verify trên server.
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText,
} from 'lucide-react'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { getTrashedClients } from '@/actions/crm-actions'
import { getCancelledTasks } from '@/actions/task-actions'
import { getMyTrashedProfiles } from '@/actions/profile-actions'
import McTrashHub from '@/components/mission-control/McTrashHub'
import McBackLink from '@/components/mission-control/McBackLink'

export const dynamic = 'force-dynamic'

export default async function MissionControlTrashPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    // MC namespace = admin cockpit → gate fail-closed; admin ⇒ "Xóa vĩnh viễn" available on the Tệp tab.
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    // Tabs 2/3/4 data (all server-gated). Tệp (tab 1) self-fetches inside TeamTrash.
    const [clientsRes, cancelledRes, profilesRes] = await Promise.all([
        getTrashedClients(workspaceId),
        getCancelledTasks(workspaceId),
        getMyTrashedProfiles(),
    ])
    const trashedClients = (clientsRes.success ? clientsRes.data : []).map((c: any) => ({
        id: c.id,
        name: c.name,
        deletedAt: c.deletedAt ? new Date(c.deletedAt).toISOString() : null,
        taskCount: c._count?.tasks ?? 0,
        subCount: c._count?.subsidiaries ?? 0,
        invoiceCount: c._count?.invoices ?? 0,
    }))
    const cancelledTasks = cancelledRes.success ? cancelledRes.data : []
    const trashedProfiles = profilesRes.profiles ?? []

    const rail: { icon: any; href?: string; active?: boolean; divider?: boolean; title?: string }[] = [
        { icon: LayoutDashboard, href: `/${workspaceId}/mc` },
        { icon: ListTodo, href: `/${workspaceId}/mc/queue` },
        { icon: Inbox, href: `/${workspaceId}/mc/requests` },
        { icon: Clapperboard, href: `/${workspaceId}/mc/tep` },
        { icon: CalendarDays, href: `/${workspaceId}/mc/lich` },
        { icon: Wallet, href: `/${workspaceId}/mc/tien`, divider: true },
        { icon: Building2, href: `/${workspaceId}/mc/crm`, title: 'Quản lý khách hàng' },
        { icon: UsersRound, href: `/${workspaceId}/mc/members`, divider: true, title: 'Thành viên' },
        { icon: Trash2, active: true, title: 'Thùng rác' },
        { icon: Activity, title: 'Phân tích — Màn 28' },
        { icon: ScrollText, title: 'Nhật ký hoạt động — Màn 29' },
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
                        <div title={r.title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.active ? '#A5B4FC' : '#A1A1AA', background: r.active ? 'rgba(99,102,241,0.18)' : 'transparent', border: r.active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: r.active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
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
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '18px 22px' }}>
                <McTrashHub
                    workspaceId={workspaceId}
                    isAdmin
                    trashedClients={trashedClients}
                    cancelledTasks={cancelledTasks as any[]}
                    trashedProfiles={trashedProfiles as any[]}
                />
            </div>
        </div>
    )
}
