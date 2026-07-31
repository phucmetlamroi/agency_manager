'use client'
// [Giao diện 2 · Mission Control · M9 Thành viên] Card nhân sự — tải + lương kỳ.
// Data-wired (server page bơm xuống DTO đã tính sẵn VND; KHÔNG có jobPriceUSD/task value thô).
// Reuse InviteToProfileModal (đúng luồng mời GĐ1). "Hồ sơ"/"Quyền" bắc cầu sang /admin/profile-members
// (nơi GĐ1 quản lý vai trò/xoá) tới khi M14/M15 hồ sơ ra đời. Trang cha admin-gated fail-closed.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    LayoutDashboard, ListTodo, Inbox, Clapperboard, CalendarDays, Wallet, Building2,
    UsersRound, Trash2, Activity, ScrollText, UserPlus, MoreHorizontal, type LucideIcon,
} from 'lucide-react'
import InviteToProfileModal from '@/components/profile/InviteToProfileModal'
import ProfileMembersPanel from '@/components/profile/ProfileMembersPanel'
import McBackLink from './McBackLink'
import { Pressable, Reveal, RevealGroup, RevealItem } from './motion-kit'

export type McMember = {
    id: string
    userId: string
    name: string
    initials: string
    avatar: string
    roleLabel: string
    isTreasurer: boolean
    // [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ `rank` + `rankColor`.
    online: boolean
    presenceLabel: string
    activeCount: number
    workloadPct: number
    loadLabel?: string
    loadColor?: string
    barColor: string
    salaryVND: number
    // [BO HANG S/A/B/C/D 2026-07-31] Bo errorRate + errorLabel + errorColor.
}

export type McMembersData = {
    workspaceId: string
    profileId: string
    profileName: string
    backHref: string
    trashHref: string
    members: McMember[]
    // [M31] "Cài đặt Tổ chức" tab (OWNER-only). Optional → when absent the board is the M9
    // roster-only screen byte-identical. `orgMembers` = raw getProfileMembers rows for the
    // reused ProfileMembersPanel (transfer-ownership · invite PENDING/14d · brand+color · org
    // soft-delete · per-member kebab); currentUserRole gates whether the tab even shows.
    currentUserId?: string
    currentUserRole?: string
    orgMembers?: any[]
    profileSettings?: { name: string; bannerUrl: string | null; logoUrl: string | null; portalAccent?: string | null }
}

const RAIL: { icon: LucideIcon; href?: string; active?: boolean; divider?: boolean; title?: string }[] = [
    { icon: LayoutDashboard, href: 'MC' }, { icon: ListTodo, href: 'QUEUE' }, { icon: Inbox, href: 'REQ' },
    { icon: Clapperboard, href: 'TEP' }, { icon: CalendarDays, href: 'LICH' },
    { icon: Wallet, href: 'TIEN', divider: true }, { icon: Building2, title: 'CRM' },
    { icon: UsersRound, active: true, divider: true, title: 'Thành viên' }, { icon: Trash2, title: 'Thùng rác' },
    { icon: Activity, title: 'Phân tích' }, { icon: ScrollText, title: 'Nhật ký hoạt động' },
]

function fmtVND(n: number): string { return `${Math.round(n).toLocaleString('vi-VN')} đ` }

export default function McMembersBoard({ data }: { data: McMembersData }) {
    const router = useRouter()
    const [inviteOpen, setInviteOpen] = useState(false)
    const [tab, setTab] = useState<'members' | 'org'>('members')
    const { workspaceId } = data
    // [M31] The org-settings tab is OWNER-only (design "chỉ CHỦ SỞ HỮU"). getProfileMembers +
    // every org action re-verify OWNER server-side, so this is UX gating on top of a hard gate.
    const isOwner = data.currentUserRole === 'OWNER' && !!data.orgMembers
    const onOrgTab = tab === 'org' && isOwner

    const railHref = (h?: string) =>
        h === 'MC' ? `/${workspaceId}/mc`
            : h === 'QUEUE' ? `/${workspaceId}/mc/queue`
                : h === 'REQ' ? `/${workspaceId}/mc/requests`
                    : h === 'TEP' ? `/${workspaceId}/mc/tep`
                        : h === 'LICH' ? `/${workspaceId}/mc/lich`
                            : h === 'TIEN' ? `/${workspaceId}/mc/tien` : undefined

    const manageHref = `/${workspaceId}/admin/profile-members`

    return (
        <div style={{ minHeight: '100dvh', background: '#050505', color: '#F4F4F5', display: 'flex', position: 'relative', fontFamily: '"Plus Jakarta Sans", -apple-system, "Segoe UI", system-ui, sans-serif' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(900px 600px at 12% -10%, rgba(99,102,241,0.10), transparent 60%),radial-gradient(800px 600px at 100% 110%, rgba(168,85,247,0.10), transparent 60%)', pointerEvents: 'none' }} />

            {/* Rail */}
            <div style={{ position: 'relative', width: 64, flexShrink: 0, background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0', gap: 4 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 18px rgba(139,92,246,0.40)', marginBottom: 12 }}>
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 18 }}>H</span>
                </div>
                {RAIL.map((r, i) => {
                    const Icon = r.icon
                    const href = railHref(r.href)
                    const inner = (
                        <Pressable as="div" title={r.title} style={{ position: 'relative', width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.active ? '#A5B4FC' : '#A1A1AA', background: r.active ? 'rgba(99,102,241,0.18)' : 'transparent', border: r.active ? '1px solid rgba(99,102,241,0.30)' : '1px solid transparent', boxShadow: r.active ? '0 4px 16px rgba(99,102,241,0.15)' : 'none' }}>
                            <Icon style={{ width: 18, height: 18 }} />
                        </Pressable>
                    )
                    return (
                        <div key={i} style={{ display: 'contents' }}>
                            {r.divider && <div style={{ width: 28, height: 1, background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />}
                            {href ? <Link href={href}>{inner}</Link> : inner}
                        </div>
                    )
                })}
                <div style={{ flex: 1 }} />
                <McBackLink backHref={data.backHref} />
            </div>

            {/* Main */}
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <Reveal style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,10,0.50)', backdropFilter: 'blur(10px)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, letterSpacing: '0.16em', color: '#71717A' }}>ORGANIZATION / MEMBERS</span>
                        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: '#F4F4F5' }}>Thành viên · {data.members.length}</span>
                    </div>
                    {/* [M31] Tab toggle — "Cài đặt Tổ chức" chỉ hiện với CHỦ SỞ HỮU (design duyệt) */}
                    {isOwner && (
                        <div style={{ display: 'flex', padding: 3, borderRadius: 999, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: 8 }}>
                            {([['members', 'Thành viên'], ['org', 'Cài đặt Tổ chức']] as const).map(([k, label]) => {
                                const on = tab === k
                                return (
                                    <Pressable key={k} type="button" onClick={() => setTab(k)} style={{ fontSize: 11.5, fontWeight: 700, padding: '5px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: on ? 'rgba(99,102,241,0.20)' : 'transparent', color: on ? '#C7D2FE' : '#71717A', transition: 'color .15s, background .15s' }}>{label}</Pressable>
                                )
                            })}
                        </div>
                    )}
                    <div style={{ flex: 1 }} />
                    {!onOrgTab && (
                        <>
                            <Link href={data.trashHref} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)', fontSize: 12, fontWeight: 600, color: '#A1A1AA', textDecoration: 'none' }}>
                                <Trash2 style={{ width: 13, height: 13 }} />Thùng rác tổ chức
                            </Link>
                            <Pressable type="button" onClick={() => setInviteOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px', borderRadius: 10, background: '#6366F1', color: '#fff', fontSize: 13, fontWeight: 700, boxShadow: '0 0 24px rgba(99,102,241,0.40)', border: 'none', cursor: 'pointer' }}>
                                <UserPlus style={{ width: 15, height: 15 }} /><span>Mời thành viên</span>
                            </Pressable>
                        </>
                    )}
                </Reveal>

                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', minHeight: 0 }}>
                    {onOrgTab ? (
                        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                            <ProfileMembersPanel
                                profileId={data.profileId}
                                profileName={data.profileName}
                                workspaceId={workspaceId}
                                members={(data.orgMembers ?? []) as any}
                                currentUserId={data.currentUserId ?? ''}
                                currentUserRole={(data.currentUserRole ?? 'OWNER') as any}
                                profileSettings={data.profileSettings}
                            />
                        </div>
                    ) : (
                    <RevealGroup style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 14 }}>
                        {/* [BỎ HẠNG S/A/B/C/D 2026-07-31] Trước đây thẻ của người hạng S có viền vàng
                            + quầng sáng riêng. Bỏ hạng thì bỏ luôn cách tô đặc biệt đó — mọi thẻ
                            nhân sự nay dùng chung một kiểu viền. */}
                        {data.members.map((m) => (
                            <RevealItem key={m.id} whileHover={{ y: -4 }} style={{ position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 10, borderRadius: 20, background: 'rgba(24,24,27,0.60)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 12px 32px rgba(0,0,0,0.55)', padding: 18 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ position: 'relative', width: 44, height: 44, borderRadius: 999, background: m.avatar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                                        {m.initials}
                                        <span style={{ position: 'absolute', bottom: 1, right: 1, width: 10, height: 10, borderRadius: 999, background: m.online ? '#34D399' : '#52525B', border: '2px solid #0A0A0A' }} />
                                    </span>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 15, fontWeight: 800, color: '#F4F4F5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
                                            {m.isTreasurer && <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: 'rgba(6,182,212,0.12)', color: '#22D3EE', border: '1px solid rgba(6,182,212,0.30)' }}>TREASURER</span>}
                                        </div>
                                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 9, letterSpacing: '0.14em', color: '#71717A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.roleLabel} · {m.presenceLabel}</span>
                                    </div>
                                    <MoreHorizontal style={{ width: 16, height: 16, color: '#71717A', flexShrink: 0 }} />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: '#71717A' }}>Đang làm</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: m.loadColor || '#D4D4D8' }}>{m.activeCount} task{m.loadLabel ? ` — ${m.loadLabel}` : ''}</span>
                                </div>
                                <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
                                    <div style={{ width: `${m.workloadPct}%`, height: '100%', borderRadius: 999, background: m.barColor }} />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: '#71717A' }}>Lương kỳ này</span>
                                    <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 800, color: m.salaryVND > 0 ? '#F4F4F5' : '#A1A1AA' }}>{fmtVND(m.salaryVND)}</span>
                                </div>
                                {/* [BỎ HẠNG S/A/B/C/D 2026-07-31] Bỏ dòng "Lỗi tháng" — nó đọc
                                    `MonthlyRank.errorRate`, mà bảng đó nay không còn được ghi nữa,
                                    nên để lại chỉ hiện số cũ đóng băng. */}

                                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                                    <Link href={manageHref} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A1A1AA', padding: 7, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none' }}>Hồ sơ</Link>
                                    <Link href={manageHref} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A5B4FC', padding: 7, borderRadius: 8, border: '1px solid rgba(99,102,241,0.3)', textDecoration: 'none' }}>Quyền</Link>
                                </div>
                            </RevealItem>
                        ))}

                        {/* Invite CTA card */}
                        <Pressable type="button" onClick={() => setInviteOpen(true)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 220, borderRadius: 20, border: '1.5px dashed rgba(255,255,255,0.14)', background: 'transparent', color: '#71717A', cursor: 'pointer' }}>
                            <span style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(99,102,241,0.10)', border: '1px solid rgba(99,102,241,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A5B4FC' }}>
                                <UserPlus style={{ width: 19, height: 19 }} />
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#A1A1AA' }}>Mời thành viên mới</span>
                            <span style={{ fontSize: 11, color: '#71717A' }}>qua email hoặc link mời</span>
                        </Pressable>
                    </RevealGroup>
                    )}
                </div>
            </div>

            {inviteOpen && (
                <InviteToProfileModal
                    profileId={data.profileId}
                    profileName={data.profileName}
                    workspaceId={workspaceId}
                    onClose={() => setInviteOpen(false)}
                    onSuccess={() => { setInviteOpen(false); router.refresh() }}
                />
            )}
        </div>
    )
}
