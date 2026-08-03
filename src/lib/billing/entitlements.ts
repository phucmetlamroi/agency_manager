// [BILLING P2] Tầng QUYỀN DÙNG (phía server) — nơi duy nhất trả lời "tổ chức này được làm gì".
//
// Mọi gate trong hệ thống (action, route, layout, nav) hỏi qua đây, KHÔNG tự đọc bảng
// Subscription. Toàn bộ phép dẫn xuất trạng thái nằm ở ./derive.ts (thuần logic, test được
// bằng scripts/billing/test-entitlements.ts không cần DB) — file này chỉ thêm DB + React.cache
// + các helper gate ném BillingError với message tiếng Việt.
//
// CÔNG TẮC TỔNG: env BILLING_ENFORCEMENT_START (ISO date). Chưa đặt / chưa tới ngày →
// `enforced=false`, mọi helper cho qua, UI chỉ hiện banner đếm ngược. Đây là cách thực thi
// điều khoản §8 (báo trước 30 ngày): code lên production trước, khoá bật sau, một chỗ duy nhất.
import 'server-only'

import { cache } from 'react'
import { prisma } from '@/lib/db'
import { getPlan, type PlanFeature } from './plans'
import { countBillableSeats, getStorageUsage, formatBytes } from './usage'
import { BillingError, deriveEntitlements, minPlanFor, type Entitlements } from './derive'

// Type + logic sống ở ./derive — re-export để mọi consumer chỉ cần biết MỘT module.
export {
    BillingError,
    deriveEntitlements,
    enforcementStart,
    isEnforced,
    minPlanFor,
    type Entitlements,
    type EntitlementStatus,
    type SubRow,
} from './derive'

const SUB_SELECT = {
    id: true,
    planCode: true,
    status: true,
    extraSeats: true,
    currentPeriodEnd: true,
    graceEndsAt: true,
    overrideSeats: true,
    overrideStorageBytes: true,
    overrideUntil: true,
} as const

/**
 * Quyền dùng của một tổ chức. React.cache → một request server chỉ query một lần
 * dù bao nhiêu gate cùng hỏi.
 *
 * NGUỒN gói: ưu tiên gói tổ chức này ĐỨNG TÊN (ownedSubscription), rồi tới gói được GẮN VÀO
 * (Profile.subscriptionId — org phụ trong pool Agency/Scale). [NỢ] Khi có khách multi-org
 * thật, countBillableSeats/getStorageUsage phải cộng dồn mọi org trong pool — hiện 1:1 nên chưa.
 */
export const getEntitlements = cache(async (profileId: string): Promise<Entitlements> => {
    const profile = await prisma.profile.findUnique({
        where: { id: profileId },
        select: {
            id: true,
            ownedSubscription: { select: SUB_SELECT },
            subscription: { select: SUB_SELECT },
        },
    })
    const sub = profile?.ownedSubscription ?? profile?.subscription ?? null
    return deriveEntitlements(profileId, sub, new Date())
})

/* ────────────────────────────────────────────────────────────────────────── */
/*  Gate helpers — dùng ở action/route. Throw BillingError với message VN.     */
/* ────────────────────────────────────────────────────────────────────────── */

/** Chặn tính năng theo gói. KHÔNG chặn gì khi chưa cưỡng chế. */
export async function requireFeature(profileId: string, feature: PlanFeature): Promise<Entitlements> {
    const ent = await getEntitlements(profileId)
    if (!ent.enforced) return ent
    if (ent.status === 'LOCKED') {
        throw new BillingError('LOCKED', 'Tổ chức chưa có gói sử dụng. Vào mục "Gói cước" để chọn gói hoặc nhập code.')
    }
    if (!ent.features.has(feature)) {
        const need = getPlan(minPlanFor(feature))
        throw new BillingError('FEATURE', `Tính năng này thuộc gói ${need.label} trở lên. Nâng cấp trong mục "Gói cước".`)
    }
    return ent
}

/** Chặn MỌI thao tác ghi khi GRACE/LOCKED. Gọi ở đầu các action mutate chính. */
export async function assertWriteAllowed(profileId: string): Promise<Entitlements> {
    const ent = await getEntitlements(profileId)
    if (!ent.enforced) return ent
    if (ent.status === 'GRACE') {
        throw new BillingError(
            'READ_ONLY',
            'Gói của tổ chức đã hết hạn — dữ liệu đang ở chế độ chỉ-đọc. Gia hạn trong mục "Gói cước" để tiếp tục làm việc.',
        )
    }
    if (ent.status === 'LOCKED') {
        throw new BillingError('LOCKED', 'Tổ chức chưa có gói sử dụng. Vào mục "Gói cước" để chọn gói hoặc nhập code.')
    }
    return ent
}

/** Trần ghế — gọi ở CHỖ GHẾ ĐƯỢC TIÊU (accept invite / create user), không chỉ chỗ mời. */
export async function checkSeatCap(profileId: string, addingSeats = 1): Promise<void> {
    const ent = await getEntitlements(profileId)
    if (!ent.enforced) return
    if (ent.seatLimit === null) return
    const used = await countBillableSeats(profileId)
    if (used + addingSeats > ent.seatLimit) {
        throw new BillingError(
            'SEAT_CAP',
            `Gói ${getPlan(ent.planCode).label} của tổ chức đã dùng ${used}/${ent.seatLimit} ghế. Mua thêm ghế hoặc nâng gói trong mục "Gói cước".`,
        )
    }
}

/** Trần dung lượng — D5: tính theo liveBytes (file khách còn thấy; thùng rác mình chịu). */
export async function checkStorageCap(profileId: string, incomingBytes: bigint): Promise<void> {
    const ent = await getEntitlements(profileId)
    if (!ent.enforced) return
    if (ent.storageLimitBytes === null) return
    const usage = await getStorageUsage(profileId)
    if (usage.liveBytes + incomingBytes > ent.storageLimitBytes) {
        throw new BillingError(
            'STORAGE_CAP',
            `Tổ chức đã dùng ${formatBytes(usage.liveBytes)}/${formatBytes(ent.storageLimitBytes)} dung lượng của gói ${getPlan(ent.planCode).label}. Xoá bớt video cũ hoặc nâng gói trong mục "Gói cước".`,
        )
    }
}

/** Bọc lỗi gate về dạng `{ error }` mà action layer của repo này vẫn trả. */
export function billingErrorMessage(e: unknown): string | null {
    return e instanceof BillingError ? e.message : null
}
