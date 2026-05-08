/**
 * Trial Status Banner — hiển thị ở top dashboard cho user đang TRIAL.
 *
 * Logic:
 * - Trial active + còn ≤ 3 ngày → cảnh báo vàng "Còn N ngày"
 * - Trial expired → đỏ "Hết hạn — read-only" + CTA upgrade
 * - Active >3 ngày hoặc paid tier → ẩn banner
 *
 * Đặt component này trong layout server component, fetch profile.subscriptionTier.
 */

import Link from 'next/link'
import { isTrialActive, isTrialExpired, trialDaysRemaining, type ProfileSubscriptionState } from '@/lib/subscription'
import { Sparkles, AlertTriangle } from 'lucide-react'

interface Props {
    profile: ProfileSubscriptionState | null
}

export default function TrialStatusBanner({ profile }: Props) {
    if (!profile) return null

    if (isTrialExpired(profile)) {
        return (
            <div className="bg-gradient-to-r from-red-500/15 to-orange-500/15 border-b border-red-500/30 px-4 py-2.5">
                <div className="max-w-7xl mx-auto flex items-center gap-3 text-sm">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-red-200 flex-1">
                        <strong>Trial đã hết hạn</strong> — Tài khoản đang ở chế độ <strong>chỉ đọc</strong>.
                        Vui lòng nâng cấp để tiếp tục tạo task, mời thành viên, và sử dụng đầy đủ tính năng.
                    </span>
                    <Link
                        href="/upgrade"
                        className="px-3 py-1 bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold rounded-md whitespace-nowrap transition-colors"
                    >
                        Nâng cấp ngay →
                    </Link>
                </div>
            </div>
        )
    }

    if (isTrialActive(profile)) {
        const daysLeft = trialDaysRemaining(profile)
        if (daysLeft <= 3) {
            return (
                <div className="bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border-b border-amber-500/30 px-4 py-2.5">
                    <div className="max-w-7xl mx-auto flex items-center gap-3 text-sm">
                        <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <span className="text-amber-200 flex-1">
                            Trial còn <strong>{daysLeft} ngày</strong> nữa — nâng cấp sớm để không bị gián đoạn.
                        </span>
                        <Link
                            href="/upgrade"
                            className="px-3 py-1 bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 text-xs font-bold rounded-md whitespace-nowrap transition-colors border border-violet-500/40"
                        >
                            Xem gói →
                        </Link>
                    </div>
                </div>
            )
        }
    }

    return null
}
