// [BILLING P1.6] Bảng giá dưới dạng mã — NGUỒN SỰ THẬT DUY NHẤT.
//
// Mọi con số về giá và hạn mức phải đọc từ file này: trang giá, chỗ chặn khi vượt trần,
// màn hình "bạn đã dùng bao nhiêu", và sau này là cổng thanh toán. Nếu để mỗi nơi tự ghi
// số của mình thì ba nơi sẽ lệch nhau, và nơi lệch sẽ là nơi tính tiền sai.
//
// Nguồn số: docs/pricing/DE-XUAT-GOI-SUBSCRIPTION-2026.md §1 (bảng giá chốt sau vòng phản biện
// 15/07/2026, chủ sản phẩm duyệt). Sửa số ở đây thì PHẢI sửa tài liệu đó, và ngược lại.
//
// File này CỐ Ý thuần dữ liệu: không import Prisma, không chạm DB, không async. Nhờ vậy nó
// dùng được ở cả server, client component, script, và test mà không kéo theo gì.

/* ────────────────────────────────────────────────────────────────────────── */
/*  Kiểu dữ liệu                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

// [Đặt tên] `planCode`, KHÔNG phải `tier`. Trong schema đã có `Client.tier` (enum ClientTier:
// DIAMOND/GOLD/SILVER/…) mang nghĩa "hạng khách hàng CRM của agency" — một tầng tenancy hoàn
// toàn khác. Dùng lại chữ `tier` ở đây là mời người đọc sau hiểu nhầm hai thứ là một.
export type PlanCode = 'FREE' | 'STUDIO' | 'AGENCY' | 'SCALE' | 'ENTERPRISE'

export type BillingCycle = 'MONTHLY' | 'ANNUAL'

// Khớp với mux.ts: 'basic' = encode miễn phí, 'plus' = mở tới độ phân giải nguồn.
// HD_1080P và UHD_4K đều chạy Mux 'plus'; khác nhau ở trần độ phân giải ta áp khi tạo asset.
export type VideoQuality = 'BASIC' | 'HD_1080P' | 'UHD_4K'

export type PlanFeature =
    | 'VELOX'                   // quét thư mục tạo task hàng loạt
    | 'MARKETPLACE_PUBLISH'     // ĐĂNG task lên chợ (nhận task thì mọi gói đều được)
    | 'SHARE_LINK_PROTECTION'   // đặt mật khẩu / hết hạn / chặn tải theo trạng thái duyệt
    | 'PAYROLL_FULL'            // tính lương đủ theo kỳ (Free chỉ xem tổng)
    | 'PAYROLL_EXPORT'          // xuất XLSX + lịch sử dài
    | 'INVOICING'               // xuất hoá đơn cho khách của agency
    | 'FINANCE_SUITE'           // sổ thu tiền + P&L + bảng giá PricingRule
    | 'CLIENT_PORTAL'           // cổng cho khách của agency
    | 'CLIENT_INTAKE'           // khách tự gửi yêu cầu qua wizard
    | 'MCP'                     // máy chủ MCP cho Claude/GPT
    | 'VERSION_COMPARE'         // so sánh 2 phiên bản + Multi-Hook Map
    | 'ANALYTICS'               // KPI / bảng xếp hạng / hồ sơ vi phạm
    | 'WHITE_LABEL'             // bỏ dòng "Sent via HustlyTasker"

/** `null` LUÔN có nghĩa là "không giới hạn". Không dùng 0, -1 hay Infinity — mỗi cái đó đều
 *  từng bị đọc nhầm thành "bằng không" ở đâu đó. Kiểm bằng `isUnlimited()` bên dưới. */
export type Limit<T> = T | null

export interface PlanLimits {
    /** Số ghế nội bộ đã bao trong giá. */
    seatsIncluded: number
    /** Trần cứng — mua thêm ghế cũng không vượt được. */
    seatCap: Limit<number>
    /** Giá mỗi ghế mua thêm (VND/tháng). `null` = gói này không bán thêm ghế. */
    extraSeatVND: Limit<number>
    /** Dung lượng lưu trữ R2. Xem ghi chú đơn vị ở `GB` bên dưới. */
    storageBytes: Limit<bigint>
    videoQuality: VideoQuality
    /** Fair-use: đây là điều khoản mềm trong ToS, KHÔNG phải đồng hồ đếm thời gian thực.
     *  Tài liệu giá §1 ghi rõ không build meter phút — vượt thì liên hệ, không tự khoá. */
    fairUseMinutesPerMonth: Limit<number>
    /** Số link chia sẻ đang còn hiệu lực cùng lúc. */
    activeShareLinks: Limit<number>
    /** Số phiên bản giữ được trên mỗi video. */
    versionsPerAsset: Limit<number>
    invoicesPerMonth: Limit<number>
    /** Số khách hàng được cấp cổng portal. */
    portalClients: Limit<number>
    /** Số tổ chức (Profile) — Agency 3 và Scale 5 CHUNG pool ghế + dung lượng.
     *  Chia pool là cố ý: nếu tách riêng thì mua 1 gói Agency rồi lập 3 tổ chức
     *  mỗi cái 15 ghế = lách trần. */
    profiles: Limit<number>
    /** Số ngày giữ thùng rác và nhật ký kiểm toán. */
    retentionDays: Limit<number>
}

export interface PlanPricing {
    /** Giá mỗi tháng khi TRẢ THÁNG. `null` với Free và Enterprise. */
    monthlyVND: Limit<number>
    /** Giá mỗi tháng khi TRẢ NĂM (thấp hơn ~17% — "trả năm tặng 2 tháng"). */
    annualMonthlyVND: Limit<number>
    /** Giá USD niêm yết, giữ để đối chiếu với tài liệu và bản landing tiếng Anh.
     *  KHÔNG dùng để tính tiền — thu bằng VND. */
    monthlyUSD: Limit<number>
    annualMonthlyUSD: Limit<number>
}

export interface Plan {
    code: PlanCode
    /** Tên hiển thị cho người dùng. */
    label: string
    pricing: PlanPricing
    limits: PlanLimits
    features: readonly PlanFeature[]
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Đơn vị dung lượng                                                         */
/* ────────────────────────────────────────────────────────────────────────── */

// [ĐƠN VỊ — đọc kỹ] Dùng GB thập phân (10^9), KHÔNG phải GiB nhị phân (2^30).
// Lý do: Cloudflare R2 tính tiền theo GB thập phân. Quota phải cùng đơn vị với hoá đơn,
// nếu không thì "khách đã dùng hết 250GB" trong ứng dụng và "250GB" trên hoá đơn là hai
// con số lệch nhau ~7%, và độ lệch đó luôn nghiêng về phía ta thu hụt.
// bigint để khớp kiểu `ReviewVersion.sizeBytes` (BigInt trong Prisma) — cộng dồn 3TB
// vượt xa ngưỡng an toàn của Number.
// Dùng `BigInt(…)` chứ KHÔNG dùng hậu tố `123n`: tsconfig của dự án đang nhắm bản JavaScript
// thấp hơn ES2020, nên cú pháp `n` không biên dịch được (TS2737). Nâng target là thay đổi ảnh
// hưởng toàn bộ bản dựng, không đáng đổi chỉ vì cách viết đẹp hơn một chút.
export const GB = BigInt(1_000_000_000)
export const TB = BigInt(1_000_000_000_000)

/** `gb(250)` đọc dễ hơn `BigInt(250) * GB`, và không có chỗ nào viết nhầm số 0. */
export const gb = (n: number): bigint => BigInt(n) * GB
export const tb = (n: number): bigint => BigInt(n) * TB

/* ────────────────────────────────────────────────────────────────────────── */
/*  Bảng giá                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

// Tỷ giá quy đổi chốt ~27.000đ/USD (đệm 3% phí cổng + trượt giá). Tài liệu giá §1 yêu cầu
// điều chỉnh theo quý và GHI RÕ trong Điều khoản sử dụng — chưa làm, xem ghi chú cuối file.
export const USD_VND_RATE = 27_000

const STUDIO_FEATURES = [
    'VELOX',
    'MARKETPLACE_PUBLISH',
    'SHARE_LINK_PROTECTION',
    'PAYROLL_FULL',
    'INVOICING',
    'CLIENT_PORTAL',
    // [Quyết định chủ sản phẩm 15/07/2026] White-label là quyền lợi của MỌI gói trả phí,
    // không còn là tường riêng của Scale. Tài liệu giá §1 dòng 37 ghi lại quyết định này.
    'WHITE_LABEL',
] as const satisfies readonly PlanFeature[]

const AGENCY_FEATURES = [
    ...STUDIO_FEATURES,
    'PAYROLL_EXPORT',
    'FINANCE_SUITE',
    'CLIENT_INTAKE',
    'MCP',
    'VERSION_COMPARE',
    'ANALYTICS',
] as const satisfies readonly PlanFeature[]

export const PLANS: Readonly<Record<PlanCode, Plan>> = {
    FREE: {
        code: 'FREE',
        label: 'Free',
        pricing: { monthlyVND: null, annualMonthlyVND: null, monthlyUSD: null, annualMonthlyUSD: null },
        limits: {
            seatsIncluded: 3,
            seatCap: 3,
            extraSeatVND: null,
            storageBytes: gb(10),
            videoQuality: 'BASIC',
            fairUseMinutesPerMonth: null,
            activeShareLinks: 10,
            versionsPerAsset: 3,
            invoicesPerMonth: 0,
            portalClients: 0,
            profiles: 1,
            retentionDays: 7,
        },
        // Free nhận task từ chợ được, nhưng không ĐĂNG được. Xem PlanFeature.MARKETPLACE_PUBLISH.
        features: [],
    },

    STUDIO: {
        code: 'STUDIO',
        label: 'Studio',
        pricing: { monthlyVND: 990_000, annualMonthlyVND: 790_000, monthlyUSD: 35, annualMonthlyUSD: 29 },
        limits: {
            seatsIncluded: 5,
            seatCap: 10,
            extraSeatVND: 165_000,
            storageBytes: gb(250),
            videoQuality: 'HD_1080P',
            fairUseMinutesPerMonth: 400,
            activeShareLinks: null,
            versionsPerAsset: null,
            invoicesPerMonth: 5,
            portalClients: 10,
            profiles: 1,
            retentionDays: 30,
        },
        features: STUDIO_FEATURES,
    },

    AGENCY: {
        code: 'AGENCY',
        label: 'Agency',
        pricing: { monthlyVND: 3_290_000, annualMonthlyVND: 2_690_000, monthlyUSD: 119, annualMonthlyUSD: 99 },
        limits: {
            seatsIncluded: 15,
            seatCap: 25,
            extraSeatVND: 139_000,
            storageBytes: tb(1),
            videoQuality: 'HD_1080P',
            fairUseMinutesPerMonth: 1_500,
            activeShareLinks: null,
            versionsPerAsset: null,
            invoicesPerMonth: null,
            portalClients: null,
            profiles: 3,
            retentionDays: 90,
        },
        features: AGENCY_FEATURES,
    },

    SCALE: {
        code: 'SCALE',
        label: 'Scale',
        pricing: { monthlyVND: 8_290_000, annualMonthlyVND: 6_690_000, monthlyUSD: 299, annualMonthlyUSD: 249 },
        limits: {
            seatsIncluded: 30,
            seatCap: 60,
            extraSeatVND: 109_000,
            storageBytes: tb(3),
            // 4K CHỈ ở Scale. Bản nháp trước từng cho Agency dùng 4K không trần và Agency lỗ:
            // Mux tính encode 4K $0,10/phút, gấp 3,2 lần 1080p ($0,03125/phút).
            videoQuality: 'UHD_4K',
            // 1 phút 4K tính bằng 3 phút theo tài liệu giá §1.
            fairUseMinutesPerMonth: 4_000,
            activeShareLinks: null,
            versionsPerAsset: null,
            invoicesPerMonth: null,
            portalClients: null,
            profiles: 5,
            retentionDays: 365,
        },
        features: AGENCY_FEATURES,
    },

    ENTERPRISE: {
        code: 'ENTERPRISE',
        label: 'Enterprise',
        // Giá thoả thuận — không niêm yết.
        pricing: { monthlyVND: null, annualMonthlyVND: null, monthlyUSD: null, annualMonthlyUSD: null },
        limits: {
            seatsIncluded: 30,
            seatCap: null,
            extraSeatVND: null,
            storageBytes: null,
            videoQuality: 'UHD_4K',
            fairUseMinutesPerMonth: null,
            activeShareLinks: null,
            versionsPerAsset: null,
            invoicesPerMonth: null,
            portalClients: null,
            profiles: null,
            retentionDays: null,
        },
        features: AGENCY_FEATURES,
    },
} as const

/** Thứ tự bày trên trang giá và thứ tự "cao hơn / thấp hơn" khi nâng-hạ gói. */
export const PLAN_ORDER: readonly PlanCode[] = ['FREE', 'STUDIO', 'AGENCY', 'SCALE', 'ENTERPRISE'] as const

/** Các gói TRẢ TIỀN. Dùng cho những quyền lợi mô tả là "mọi gói trả phí" (vd white-label). */
export const PAID_PLANS: readonly PlanCode[] = ['STUDIO', 'AGENCY', 'SCALE', 'ENTERPRISE'] as const

/* ────────────────────────────────────────────────────────────────────────── */
/*  Dùng thử                                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

// Tài liệu giá §1 "Cơ chế launch". Trial cố ý có trần dung lượng và phút RIÊNG, thấp hơn
// Agency thật — nếu cho trial full Agency không trần thì mỗi lần đăng ký là một hoá đơn Mux
// mở, và không cần thẻ nghĩa là lập tài khoản mới không tốn gì.
export const TRIAL = {
    /** Ngày dùng thử, tính từ lúc bắt đầu. */
    days: 14,
    /** Trial cho dùng bộ tính năng của gói này… */
    planCode: 'AGENCY' as PlanCode,
    /** …nhưng với trần dung lượng riêng, thấp hơn Agency thật (1TB). */
    storageBytes: gb(100),
    /** …và trần phút video riêng, thấp hơn Agency thật (1.500). */
    videoMinutes: 300,
    /** Bắt buộc xác minh email trước khi được trial — chặn lập tài khoản hàng loạt. */
    requiresEmailVerification: true,
    /** Hết trial mà không trả tiền: dữ liệu chuyển CHỈ-ĐỌC trong ngần này ngày rồi mới dọn.
     *  KHÔNG xoá ngay — mất dữ liệu của người đang cân nhắc trả tiền là mất luôn khách. */
    readOnlyGraceDays: 30,
} as const

/* ────────────────────────────────────────────────────────────────────────── */
/*  Hàm tiện ích                                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/** `null` = không giới hạn. Luôn dùng hàm này thay vì tự so `=== null` rải rác. */
export function isUnlimited<T>(limit: Limit<T>): limit is null {
    return limit === null
}

export function getPlan(code: PlanCode): Plan {
    return PLANS[code]
}

export function planHasFeature(code: PlanCode, feature: PlanFeature): boolean {
    return PLANS[code].features.includes(feature)
}

/** So thứ bậc hai gói. Âm = `a` thấp hơn `b`. Dùng để phân biệt nâng gói và hạ gói. */
export function comparePlans(a: PlanCode, b: PlanCode): number {
    return PLAN_ORDER.indexOf(a) - PLAN_ORDER.indexOf(b)
}

/** Giá phải trả mỗi tháng theo chu kỳ đã chọn. `null` = không niêm yết (Free / Enterprise). */
export function monthlyPriceVND(code: PlanCode, cycle: BillingCycle): number | null {
    const p = PLANS[code].pricing
    return cycle === 'ANNUAL' ? p.annualMonthlyVND : p.monthlyVND
}

/** Tổng tiền một lần thu, theo chu kỳ. Trả năm = giá tháng × 12. */
export function chargeAmountVND(code: PlanCode, cycle: BillingCycle, extraSeats = 0): number | null {
    const monthly = monthlyPriceVND(code, cycle)
    if (monthly === null) return null
    const seatVND = PLANS[code].limits.extraSeatVND ?? 0
    const perMonth = monthly + seatVND * Math.max(0, extraSeats)
    return cycle === 'ANNUAL' ? perMonth * 12 : perMonth
}

/** Trần ghế thực tế sau khi mua thêm — vẫn không được vượt `seatCap`. */
export function effectiveSeatLimit(code: PlanCode, purchasedExtraSeats = 0): Limit<number> {
    const { seatsIncluded, seatCap } = PLANS[code].limits
    if (isUnlimited(seatCap)) return null
    return Math.min(seatCap, seatsIncluded + Math.max(0, purchasedExtraSeats))
}

// ── NỢ ĐÃ BIẾT, chưa làm ở bước này ─────────────────────────────────────────
// 1. Tỷ giá USD_VND_RATE phải được ghi trong Điều khoản sử dụng kèm cơ chế điều chỉnh
//    theo quý (tài liệu giá §1). Điều khoản hiện tại chưa có một chữ nào về giá.
// 2. Chưa có nơi lưu gói của từng tổ chức — cột đó cần đổi prisma/schema.prisma và
//    phải được chủ sản phẩm duyệt riêng vì repo này dùng `db push` thủ công, không migrate.
// 3. fairUseMinutesPerMonth hiện chỉ là con số để hiển thị và để viết vào ToS. Muốn đo thật
//    phải lưu thời lượng video lúc tạo asset — hiện DB không lưu.
