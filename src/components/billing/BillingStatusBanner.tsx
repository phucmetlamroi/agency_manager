// [BILLING P5] Banner trạng thái gói — server component, gắn trong admin/dashboard layout.
//
// Ba mặt, đúng D7:
//   • CHƯA cưỡng chế + đã hẹn ngày + tổ chức chưa có gói → banner hổ phách đếm ngược:
//     lời báo 30 ngày của điều khoản §8 hiện NGAY TRONG APP, không chỉ trong email.
//   • GRACE → banner đỏ "chỉ-đọc" + hạn dọn dữ liệu.
//   • LOCKED (đã cưỡng chế) → banner đỏ đậm; P6 sẽ chặn hẳn route, banner này là lớp
//     nhắc cho các trang chưa bị chặn (vd editor trong dashboard — họ không sửa được
//     billing nhưng phải hiểu vì sao mọi nút ghi đều từ chối).
// ACTIVE hoặc chưa-hẹn-ngày → render null, không tốn một pixel.
import Link from 'next/link'
import { AlertTriangle, Lock, CalendarClock } from 'lucide-react'
import { resolveWorkspaceProfileId } from '@/lib/prisma-workspace'
import { getEntitlements, enforcementStart } from '@/lib/billing/entitlements'
import { getPlan } from '@/lib/billing/plans'

const fmtDate = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`

export default async function BillingStatusBanner({ workspaceId }: { workspaceId: string }) {
    let content: React.ReactNode = null
    try {
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) return null
        const ent = await getEntitlements(profileId)
        const billingHref = `/${workspaceId}/admin/billing`

        if (!ent.enforced) {
            const start = enforcementStart()
            // Chỉ nhắc người SẼ bị ảnh hưởng — org đang ACTIVE (đã mua/nhập code/override) thì im.
            if (!start || ent.status === 'ACTIVE') return null
            content = (
                <div className="flex items-center gap-3 border-b border-amber-500/25 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-200">
                    <CalendarClock className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                        Từ <strong>{fmtDate(start)}</strong>, Velox chuyển sang gói trả phí — tổ chức này chưa có gói.
                    </span>
                    <Link href={billingHref} className="ml-auto shrink-0 rounded-lg border border-amber-400/40 px-3 py-1 font-medium text-amber-100 hover:bg-amber-500/20">
                        Chọn gói / nhập code
                    </Link>
                </div>
            )
        } else if (ent.status === 'GRACE') {
            content = (
                <div className="flex items-center gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                        Gói {getPlan(ent.planCode).label} đã hết hạn — dữ liệu đang <strong>chỉ-đọc</strong>
                        {ent.graceEndsAt ? <> tới {fmtDate(ent.graceEndsAt)}</> : null}. Gia hạn để tiếp tục làm việc.
                    </span>
                    <Link href={billingHref} className="ml-auto shrink-0 rounded-lg border border-red-400/40 px-3 py-1 font-medium text-red-100 hover:bg-red-500/20">
                        Gia hạn ngay
                    </Link>
                </div>
            )
        } else if (ent.status === 'LOCKED') {
            content = (
                <div className="flex items-center gap-3 border-b border-red-500/40 bg-red-600/15 px-4 py-2.5 text-sm text-red-200">
                    <Lock className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">Tổ chức chưa có gói sử dụng — các thao tác tạo mới đang bị khoá.</span>
                    <Link href={billingHref} className="ml-auto shrink-0 rounded-lg border border-red-400/40 px-3 py-1 font-medium text-red-100 hover:bg-red-500/20">
                        Chọn gói / nhập code
                    </Link>
                </div>
            )
        }
    } catch {
        // Banner là tiện nghi — lỗi đọc gói không được đánh sập layout.
        return null
    }
    return content
}
