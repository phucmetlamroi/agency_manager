// [Mobile P1 §3.5 / M15] Menu hub — section-list các khu quản trị KHÔNG nằm trên
// BottomNav (Trang chủ/Task/Khách/Lịch đã có tab riêng). Row ≥56px, lọc "Tài chính"
// theo isTreasurer. Admin layout đã gate quyền (canAccessAdmin) → trang chỉ dựng list.
import { verifyActiveSession } from '@/lib/security'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Inbox, Wallet, Building2, UsersRound, Trash2, Activity, ScrollText, Settings, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type IconType = React.ComponentType<{ className?: string }>
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
        <div className="flex flex-col gap-6">
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">Menu quản trị</h1>
            {sections.map((sec) => {
                const rows = sec.rows.filter((r) => !r.treasurerOnly || isTreasurer)
                if (!rows.length) return null
                return (
                    <section key={sec.title} className="flex flex-col gap-1.5">
                        <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{sec.title}</h2>
                        <div className="overflow-hidden rounded-2xl border border-white/10 glass-1">
                            {rows.map((r, i) => (
                                <Link
                                    key={r.href}
                                    href={r.href}
                                    className={cn(
                                        'flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/5',
                                        i > 0 && 'border-t border-white/5'
                                    )}
                                >
                                    <r.icon className="h-5 w-5 shrink-0 text-primary-accent" />
                                    <div className="min-w-0 flex-1">
                                        <span className="block truncate text-sm text-zinc-100">{r.label}</span>
                                        <span className="block truncate text-caption text-muted-foreground">{r.desc}</span>
                                    </div>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </Link>
                            ))}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
