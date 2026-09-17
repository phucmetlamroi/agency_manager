// [BILLING P2] Phần THUẦN LOGIC của tầng quyền dùng — tách khỏi entitlements.ts có chủ đích:
//   • KHÔNG import 'server-only', KHÔNG import '@/lib/db' → scripts/billing/test-entitlements.ts
//     (chạy `npx tsx`, không resolve alias, không có RSC context) import thẳng bằng đường dẫn
//     tương đối được. Đây đúng lý do measure-usage.ts từng phải chép tay billableSeatWhere.
//   • `now` tiêm được → test mọi mốc thời gian không cần đợi.
// entitlements.ts (server) bọc file này với DB + React.cache. Đừng thêm import nặng vào đây.
import {
    PLANS,
    PLAN_ORDER,
    TRIAL,
    getPlan,
    effectiveSeatLimit,
    type Limit,
    type PlanCode,
    type PlanFeature,
    type PlanLimits,
} from './plans'

/* ────────────────────────────────────────────────────────────────────────── */
/*  Kiểu dữ liệu                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

export type EntitlementStatus = 'ACTIVE' | 'GRACE' | 'LOCKED'

export interface Entitlements {
    profileId: string
    /** Gói đang áp. LOCKED không có gói → 'FREE' (sàn nội bộ, không phải gói bán). */
    planCode: PlanCode
    status: EntitlementStatus
    /** GRACE/LOCKED = true. Mọi action ghi phải từ chối khi cờ này bật (assertWriteAllowed). */
    readOnly: boolean
    features: ReadonlySet<PlanFeature>
    /** Hạn mức đã áp override (D4). null = không giới hạn. */
    seatLimit: Limit<number>
    storageLimitBytes: Limit<bigint>
    limits: PlanLimits
    /** Mốc hết hiệu lực đang chi phối (periodEnd hoặc overrideUntil). null = vĩnh viễn/không có. */
    effectiveEnd: Date | null
    /** Ngày còn lại tới effectiveEnd (làm tròn lên). null = vĩnh viễn hoặc không có gói. */
    daysLeft: number | null
    /** Hết GRACE lúc nào (chỉ có nghĩa khi status='GRACE'). */
    graceEndsAt: Date | null
    /** false = chưa tới BILLING_ENFORCEMENT_START → mọi gate cho qua, chỉ hiển thị. */
    enforced: boolean
    /** Có bản ghi Subscription không (phân biệt "chưa từng có gói" với "hết hạn"). */
    hasSubscription: boolean
    subscriptionId: string | null
}

/** Lỗi gate — message là tiếng Việt hiển thị thẳng cho người dùng qua `{ error }`. */
export class BillingError extends Error {
    readonly code: 'FEATURE' | 'READ_ONLY' | 'LOCKED' | 'SEAT_CAP' | 'STORAGE_CAP'
    constructor(code: BillingError['code'], message: string) {
        super(message)
        this.name = 'BillingError'
        this.code = code
    }
}

/** Hàng Subscription tối thiểu mà phép dẫn xuất cần — khớp SUB_SELECT bên entitlements.ts. */
export interface SubRow {
    id: string
    planCode: string
    status: string
    extraSeats: number
    currentPeriodEnd: Date | null
    graceEndsAt: Date | null
    overrideSeats: number | null
    overrideStorageBytes: bigint | null
    overrideUntil: Date | null
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Công tắc tổng                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/** Đọc TẠI THỜI ĐIỂM GỌI (không cache module-level) để test đổi env được và để đổi biến
 *  trên Vercel có hiệu lực ngay lần deploy sau, không phụ thuộc thứ tự import. */
export function enforcementStart(): Date | null {
    const raw = process.env.BILLING_ENFORCEMENT_START
    if (!raw) return null
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) {
        // Gõ sai ngày KHÔNG được khoá nhầm cả hệ thống — fail-open + kêu to trong log.
        console.error(`[billing] BILLING_ENFORCEMENT_START không đọc được ("${raw}") — coi như CHƯA cưỡng chế.`)
        return null
    }
    return d
}

export function isEnforced(now = new Date()): boolean {
    const start = enforcementStart()
    return start !== null && now >= start
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Phép dẫn xuất                                                             */
/* ────────────────────────────────────────────────────────────────────────── */

const GRACE_MS = TRIAL.readOnlyGraceDays * 24 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Trạng thái hiệu lực là thứ DẪN XUẤT từ ngày giờ + ngoại lệ, không phải cột `status` thô:
 * cron sweep có thể chậm một ngày, và ngoại lệ vĩnh viễn (D4) không có periodEnd nào cả.
 * CANCELED không cần nhánh riêng — người dùng chủ động dừng thì dùng nốt kỳ đã trả,
 * dates vẫn chi phối; khác biệt duy nhất là cron không gửi nhắc gia hạn.
 */
export function deriveEntitlements(profileId: string, sub: SubRow | null, now = new Date()): Entitlements {
    const enforced = isEnforced(now)

    const locked = (hasSub: boolean, subId: string | null): Entitlements => {
        const floor = getPlan('FREE') // sàn nội bộ — KHÔNG phải gói bán (plans.ts ghi rõ)
        return {
            profileId,
            planCode: 'FREE',
            status: 'LOCKED',
            readOnly: true,
            features: new Set<PlanFeature>(),
            seatLimit: floor.limits.seatCap,
            storageLimitBytes: floor.limits.storageBytes,
            limits: floor.limits,
            effectiveEnd: null,
            daysLeft: null,
            graceEndsAt: null,
            enforced,
            hasSubscription: hasSub,
            subscriptionId: subId,
        }
    }

    if (!sub) return locked(false, null)

    const planCode = (sub.planCode in PLANS ? sub.planCode : 'FREE') as PlanCode
    const plan = getPlan(planCode)

    // Ngoại lệ (D4) đang hiệu lực? overrideUntil rỗng = vĩnh viễn.
    const hasOverrideGrant =
        (sub.overrideSeats !== null || sub.overrideStorageBytes !== null) &&
        (sub.overrideUntil === null || now <= sub.overrideUntil)

    const inPaidPeriod = sub.currentPeriodEnd !== null && now <= sub.currentPeriodEnd

    // Mốc hết hiệu lực đang chi phối: kỳ trả tiền HOẶC hạn ngoại lệ — lấy mốc muộn hơn.
    const permanentOverride = hasOverrideGrant && sub.overrideUntil === null
    const candidates = [
        inPaidPeriod ? sub.currentPeriodEnd : null,
        hasOverrideGrant ? sub.overrideUntil : null,
    ].filter((d): d is Date => d !== null)
    const effectiveEnd = permanentOverride
        ? null
        : candidates.length
          ? new Date(Math.max(...candidates.map((d) => d.getTime())))
          : null

    if (inPaidPeriod || hasOverrideGrant) {
        return {
            profileId,
            planCode,
            status: 'ACTIVE',
            readOnly: false,
            features: new Set(plan.features),
            // Override là trần RIÊNG thay thế trần gói (SCHEMA-DE-XUAT §2), không phải cộng thêm.
            seatLimit: sub.overrideSeats ?? effectiveSeatLimit(planCode, sub.extraSeats),
            storageLimitBytes: sub.overrideStorageBytes ?? plan.limits.storageBytes,
            limits: plan.limits,
            effectiveEnd,
            daysLeft: effectiveEnd ? Math.max(0, Math.ceil((effectiveEnd.getTime() - now.getTime()) / DAY_MS)) : null,
            graceEndsAt: null,
            enforced,
            hasSubscription: true,
            subscriptionId: sub.id,
        }
    }

    // Hết hiệu lực → GRACE chỉ-đọc (D6). Mốc hết GRACE: cột graceEndsAt nếu cron đã ghi,
    // không thì DẪN XUẤT = mốc-hết-hiệu-lực-cuối + 30 ngày (cron chậm không khoá khách sớm).
    const lastEnd = [sub.currentPeriodEnd, sub.overrideUntil]
        .filter((d): d is Date => d !== null)
        .reduce<Date | null>((a, b) => (a === null || b > a ? b : a), null)
    if (lastEnd === null) return locked(true, sub.id) // có bản ghi nhưng chưa từng kích hoạt

    const graceEnd = sub.graceEndsAt ?? new Date(lastEnd.getTime() + GRACE_MS)
    if (now <= graceEnd) {
        return {
            profileId,
            planCode,
            status: 'GRACE',
            readOnly: true,
            // Giữ nguyên bộ tính năng gói cũ: khách vẫn THẤY mọi thứ mình từng có (đúng lời hứa
            // "xem + tải trong 30 ngày"), chỉ có ghi là bị assertWriteAllowed chặn.
            features: new Set(plan.features),
            seatLimit: sub.overrideSeats ?? effectiveSeatLimit(planCode, sub.extraSeats),
            storageLimitBytes: sub.overrideStorageBytes ?? plan.limits.storageBytes,
            limits: plan.limits,
            effectiveEnd: lastEnd,
            daysLeft: 0,
            graceEndsAt: graceEnd,
            enforced,
            hasSubscription: true,
            subscriptionId: sub.id,
        }
    }

    return locked(true, sub.id)
}

/** Gói THẤP NHẤT có tính năng — để câu báo lỗi chỉ đúng chỗ cần nâng lên. */
export function minPlanFor(feature: PlanFeature): PlanCode {
    for (const code of PLAN_ORDER) {
        if (PLANS[code].features.includes(feature)) return code
    }
    return 'ENTERPRISE'
}
