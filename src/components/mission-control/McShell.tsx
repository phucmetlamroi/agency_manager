// [Giao diện 2 · Mission Control] Shared cockpit shell — 64px icon rail + radial-gradient
// backdrop + main slot. NEW file used only by the M28/M29/M30 reuse-wrap pages, so it does
// NOT touch any existing MC page (their inline rails stay byte-identical). Server component:
// pure Link + icon chrome, no client state. Pass `active` = the rail key to highlight.
import Link from 'next/link'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText, Settings,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import McBackLink from './McBackLink'

type RailKey =
    | 'dashboard' | 'board' | 'requests' | 'tep' | 'lich' | 'tien'
    | 'crm' | 'members' | 'trash' | 'analytics' | 'audit' | 'settings' | 'none'

export default function McShell({
    workspaceId,
    active,
    children,
}: {
    workspaceId: string
    active: RailKey
    children: React.ReactNode
}) {
    const main: { key: RailKey; icon: LucideIcon; href: string; divider?: boolean; title: string }[] = [
        { key: 'dashboard', icon: LayoutDashboard, href: `/${workspaceId}/mc`, title: 'Tổng quan' },
        { key: 'board', icon: ListTodo, href: `/${workspaceId}/mc/board`, title: 'Vận hành bảng task' },
        { key: 'requests', icon: Inbox, href: `/${workspaceId}/mc/requests`, title: 'Hộp thư yêu cầu' },
        { key: 'tep', icon: Clapperboard, href: `/${workspaceId}/mc/tep`, title: 'Tệp — Review' },
        { key: 'lich', icon: CalendarDays, href: `/${workspaceId}/mc/lich`, title: 'Lịch' },
        { key: 'tien', icon: Wallet, href: `/${workspaceId}/mc/tien`, divider: true, title: 'Tiền — Payroll' },
        { key: 'crm', icon: Building2, href: `/${workspaceId}/mc/crm`, title: 'Quản lý khách hàng' },
        { key: 'members', icon: UsersRound, href: `/${workspaceId}/mc/members`, divider: true, title: 'Thành viên' },
        { key: 'trash', icon: Trash2, href: `/${workspaceId}/mc/trash`, title: 'Thùng rác' },
        { key: 'analytics', icon: Activity, href: `/${workspaceId}/mc/analytics`, title: 'Phân tích hiệu suất' },
        { key: 'audit', icon: ScrollText, href: `/${workspaceId}/mc/audit`, title: 'Nhật ký hoạt động' },
    ]

    const dot = (isActive: boolean, Icon: LucideIcon, title: string) => (
        <div title={title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isActive ? '#A5B4FC' : '#A1A1AA', background: isActive ? 'rgba(99,102,241,0.18)' : 'transparent', border: isActive ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: isActive ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
            <Icon style={{ width: 18, height: 18 }} />
        </div>
    )

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {main.map((r) => (
                    <div key={r.key} style={{ display: 'contents' }}>
                        {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                        <Link href={r.href}>{dot(active === r.key, r.icon, r.title)}</Link>
                    </div>
                ))}
                <div style={{ flex: 1 }} />
                <Link href={`/${workspaceId}/mc/settings`}>{dot(active === 'settings', Settings, 'Cài đặt Workspace')}</Link>
                <McBackLink backHref={`/${workspaceId}/admin`} />
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, padding: '18px 22px', overflow: 'auto' }}>
                {children}
            </div>
        </div>
    )
}
