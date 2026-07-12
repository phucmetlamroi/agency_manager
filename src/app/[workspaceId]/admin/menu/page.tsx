// [Mobile P1 §3.5 / M15] Menu hub — section-list các khu quản trị KHÔNG nằm trên
// BottomNav (Trang chủ/Task/Khách/Lịch đã có tab riêng). Row ≥48px, lọc "Tài chính"
// theo isTreasurer. Admin layout đã gate quyền (canAccessAdmin) → trang chỉ dựng list.
// [design-handoff parity] reskinned under `.mroot` (indigo #6366F1 --m-* tokens) to match the
// owner's prototype — presentational only; server guards + data + hrefs unchanged. The account/
// workspace-switch entry stays on the shell AppHeader (avatar→AccountSheet), so this page has no
// in-page header — avoids two divergent workspace-switch paths per the spec's risk note.
import { verifyActiveSession } from '@/lib/security'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Wallet, Building2, UsersRound, Trash2, Activity, ScrollText, Settings, ChevronRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

type IconType = React.ComponentType<{ className?: string; style?: React.CSSProperties; size?: number }>
// [Owner review 2026-07-11] Mỗi dòng KÈM MÔ TẢ — chủ dự án không rõ "Phân tích"/"Thành viên/
// Tổ chức" là gì + tìm mãi "theo dõi hiệu suất" (chính là Phân tích). Copy theo UI-UX-SPEC Phụ lục A.
interface Row { label: string; desc: string; href: string; icon: IconType; treasurerOnly?: boolean }

export default async function AdminMenuPage({ params }: { params: Promise<{ workspaceId: string }> }) {
    const { workspaceId: ws } = await params
    const { status, dbUser } = await verifyActiveSession()
    if (status === 'unauthorized' || !dbUser) redirect('/login')
    if (status === 'locked') redirect('/api/auth/logout')
    const isTreasurer = dbUser.isTreasurer ?? false

    const sections: { title: string; rows: Row[] }[] = [
        {
            title: 'Vận hành', rows: [
                { label: 'Hộp thư yêu cầu', desc: 'Yêu cầu tạo task khách gửi vào', href: `/${ws}/admin/requests`, icon: Inbox },
                { label: 'Bảng lương', desc: 'Lương & thanh toán theo kỳ', href: `/${ws}/admin/payroll`, icon: Wallet },
                { label: 'Tài chính', desc: 'Thu chi của workspace', href: `/${ws}/admin/finance`, icon: Building2, treasurerOnly: true },
            ],
        },
        {
            title: 'Tổ chức', rows: [
                { label: 'Thành viên', desc: 'Quản lý người trong tổ chức', href: `/${ws}/admin/profile-members`, icon: UsersRound },
                { label: 'Phân tích hiệu suất', desc: 'Số liệu năng suất & lỗi của team', href: `/${ws}/admin/analytics`, icon: Activity },
                { label: 'Nhật ký hoạt động', desc: 'Ai đã làm gì, khi nào', href: `/${ws}/admin/audit-log`, icon: ScrollText },
                { label: 'Thùng rác tổ chức', desc: 'Khôi phục mục đã xoá', href: `/${ws}/admin/profile-trash`, icon: Trash2 },
                { label: 'Cài đặt', desc: 'Tên, kết nối, tổ chức, vùng nguy hiểm', href: `/${ws}/admin/settings`, icon: Settings },
            ],
        },
    ]

    return (
        <section className="mroot m-scr flex flex-col gap-3">
            {sections.map((sec) => {
                const rows = sec.rows.filter((r) => !r.treasurerOnly || isTreasurer)
                if (!rows.length) return null
                return (
                    <div key={sec.title} className="flex flex-col" style={{ gap: 6 }}>
                        <h2 className="m-eb" style={{ paddingLeft: 2 }}>{sec.title}</h2>
                        <div className="m-card overflow-hidden">
                            {rows.map((r, i) => (
                                <Link
                                    key={r.href}
                                    href={r.href}
                                    className="m-press flex items-center"
                                    style={{ gap: 10, padding: '11px 14px', minHeight: 48, borderBottom: i < rows.length - 1 ? '1px solid var(--m-border-1)' : 'none' }}
                                >
                                    <r.icon size={19} style={{ color: 'var(--m-primary-hover)', flexShrink: 0 }} />
                                    <div className="min-w-0" style={{ flex: 1 }}>
                                        <span className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--m-fg-1)' }}>{r.label}</span>
                                        <span className="block truncate" style={{ fontSize: 10.5, color: 'var(--m-fg-4)', marginTop: 1 }}>{r.desc}</span>
                                    </div>
                                    {r.treasurerOnly && (
                                        <span className="m-pill" style={{ fontSize: 9, padding: '1px 7px', color: 'var(--m-fg-3)', flexShrink: 0 }}>Treasurer</span>
                                    )}
                                    <ChevronRight size={15} style={{ color: 'var(--m-fg-4)', flexShrink: 0 }} />
                                </Link>
                            ))}
                        </div>
                    </div>
                )
            })}
        </section>
    )
}
