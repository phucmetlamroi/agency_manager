// [Giao diện 2 · Mission Control · M8 Tệp / Review] MC-shell wrapping the real TeamBrowser.
// Reuses the ENTIRE Video Review file browser (folder tree · asset list + status pills ·
// InfoPanel "Gửi khách duyệt" / share link / tải về · context menus · selection bar) — cùng
// logic GĐ1 /team, chỉ khoác vỏ Mission Control (rail + header dark) và ẩn tiêu đề module nội
// bộ (chromeless) để header MC không bị nhân đôi. Module KHÔNG chứa field tiền → 0 rủi ro rò rỉ.
// Admin-gated fail-closed (nhất quán với mọi route /mc/*; editor vẫn dùng GĐ1 /team).
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { verifyProfileAdminAccess } from '@/lib/security'
import { TeamBrowser } from '@/components/review/TeamBrowser'
import McBackLink from '@/components/mission-control/McBackLink'
import { LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function MissionControlTepPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId } = await params
    const session = await getSession()
    if (!session) redirect('/login')
    try { await verifyProfileAdminAccess(workspaceId) } catch { redirect(`/${workspaceId}/dashboard`) }

    const currentUserId = (session.user as { id?: string } | undefined)?.id ?? ''

    const rail: { icon: any; href?: string; active?: boolean; divider?: boolean }[] = [
        { icon: LayoutDashboard, href: `/${workspaceId}/mc` }, { icon: ListTodo, href: `/${workspaceId}/mc/queue` }, { icon: Inbox, href: `/${workspaceId}/mc/requests` }, { icon: Clapperboard, active: true },
        { icon: CalendarDays, href: `/${workspaceId}/mc/lich` }, { icon: Wallet, href: `/${workspaceId}/mc/tien`, divider: true }, { icon: Building2 },
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
                        <Clapperboard style={{ width: 18, height: 18, color: '#A5B4FC' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F4F5' }}>Tệp</span>
                        <span style={{ fontSize: 11, color: '#A1A1AA' }}>Trình duyệt bản dựng video — khách duyệt qua link, đồng bộ trạng thái task.</span>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 }}>
                    <TeamBrowser workspaceId={workspaceId} initialFolderId={null} currentUserId={currentUserId} isAdmin chromeless playerBase={`/${workspaceId}/mc/asset`} sharesHref={`/${workspaceId}/mc/shares`} trashHref={`/${workspaceId}/mc/trash`} />
                </div>
            </div>
        </div>
    )
}
