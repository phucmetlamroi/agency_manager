'use server'

// [BILLING P3] Action tầng thu phí Velox↔người dùng — order SePay + trial/gift code.
//
// HAI VAI, HAI CỔNG, đừng trộn:
//   • Profile admin (verifyProfileAdminAccess): tạo đơn nâng gói, xem trạng thái đơn, nhập code
//     — thao tác trên gói CỦA TỔ CHỨC MÌNH.
//   • Global admin (User.role==='ADMIN' — chủ Velox): phát hành/thu hồi code — thao tác trên
//     TIỀN CỦA HỆ THỐNG. Không bao giờ hạ cổng này xuống profile admin: một admin tổ chức tự
//     phát code cho chính mình là tự in tiền.
//
// Convention trả về: { success } | { error } — giống mọi action khác trong repo (toast đọc thẳng).

import { randomInt } from 'node:crypto'
import { prisma } from '@/lib/db'
import { verifyProfileAdminAccess, verifyActiveSession } from '@/lib/security'
import { resolveWorkspaceProfileId } from '@/lib/prisma-workspace'
import { audit } from '@/lib/audit-log'
import {
    SELLABLE_PLANS,
    isSellablePlan,
    getPlan,
    chargeAmountVND,
    comparePlans,
    TRIAL,
    type BillingCycle,
    type PlanCode,
} from '@/lib/billing/plans'
import { getEntitlements } from '@/lib/billing/entitlements'
import { getSepayConfig, buildSepayQrUrl } from '@/lib/billing/sepay'

/* ────────────────────────────────────────────────────────────────────────── */
/*  Sinh mã                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

// Bỏ 0/O/1/I/L — người ta gõ tay vào app ngân hàng (SCHEMA-DE-XUAT §4).
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function randomCode(len: number): string {
    let out = ''
    for (let i = 0; i < len; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
    return out
}

/** Mã chuyển khoản: tiền tố VELOX cố định để SePay tự tách vào trường `code` của webhook. */
const newPaymentCode = () => `VELOX${randomCode(8)}`

/** Gift/trial code: nhóm 4 cho dễ đọc-chép (VLX-XXXX-XXXX-XXXX). */
const newGiftCode = () => `VLX-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`

/** Người dùng gõ kiểu gì cũng về một dạng: HOA, bỏ khoảng trắng + gạch. */
const normalizeGiftCode = (raw: string) => raw.toUpperCase().replace(/[\s-]+/g, '')

const ORDER_TTL_MS = 24 * 60 * 60 * 1000 // mã chuyển khoản sống 24h

/* ────────────────────────────────────────────────────────────────────────── */
/*  Đơn thanh toán (profile admin)                                            */
/* ────────────────────────────────────────────────────────────────────────── */

export interface CheckoutInfo {
    orderId: string
    paymentCode: string
    amountVND: number
    planCode: PlanCode
    billingCycle: BillingCycle
    extraSeats: number
    expiresAt: string
    payTo: { bank: string; accountNumber: string; qrUrl: string }
}

/**
 * Khách bấm "Nâng gói" → một SubscriptionOrder PENDING + thông tin chuyển khoản.
 * `amountVND` chốt tại đây, KHÔNG tính lại lúc đối chiếu (giá đúng = giá khách nhìn thấy).
 * Một subscription chỉ giữ MỘT đơn PENDING — đơn mới huỷ đơn cũ, để webhook không bao giờ
 * phải đoán giữa hai mã còn sống.
 */
export async function createSubscriptionOrder(
    workspaceId: string,
    input: { planCode: string; billingCycle: string; extraSeats?: number },
): Promise<{ success: true; checkout: CheckoutInfo } | { error: string }> {
    try {
        const access = await verifyProfileAdminAccess(workspaceId)
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) return { error: 'Workspace chưa gắn tổ chức — không tạo được đơn.' }

        const sepay = getSepayConfig()
        if (!sepay) return { error: 'Hệ thống chưa cấu hình cổng thanh toán. Liên hệ HustlyTasker.' }

        if (!isSellablePlan(input.planCode)) return { error: 'Gói không hợp lệ.' }
        const planCode = input.planCode as PlanCode
        const billingCycle: BillingCycle = input.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'

        const plan = getPlan(planCode)
        const maxExtra = plan.limits.seatCap !== null ? plan.limits.seatCap - plan.limits.seatsIncluded : 0
        const extraSeats = Math.min(Math.max(0, Math.floor(input.extraSeats ?? 0)), Math.max(0, maxExtra))

        const amountVND = chargeAmountVND(planCode, billingCycle, extraSeats)
        if (amountVND === null || amountVND <= 0) return { error: 'Gói này không niêm yết giá — liên hệ trực tiếp.' }

        const now = new Date()
        const result = await prisma.$transaction(async (tx) => {
            // Khoá theo profile: hai tab cùng bấm không đẻ hai subscription/hai đơn PENDING.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${profileId}, 0))`

            // Bản ghi Subscription là NƠI NEO đơn + code; tạo ở đây chưa kích hoạt gì
            // (deriveEntitlements: không period + không override = LOCKED như cũ).
            const sub = await tx.subscription.upsert({
                where: { ownerProfileId: profileId },
                create: { ownerProfileId: profileId, planCode, status: 'ACTIVE', billingCycle },
                update: {},
                select: { id: true },
            })
            await tx.profile.update({ where: { id: profileId }, data: { subscriptionId: sub.id } })

            await tx.subscriptionOrder.updateMany({
                where: { subscriptionId: sub.id, status: 'PENDING' },
                data: { status: 'CANCELED' },
            })

            // paymentCode unique — va chạm gần như không thể (31^8), nhưng thử lại cho chắc.
            for (let attempt = 0; attempt < 3; attempt++) {
                const paymentCode = newPaymentCode()
                try {
                    return await tx.subscriptionOrder.create({
                        data: {
                            subscriptionId: sub.id,
                            paymentCode,
                            planCode,
                            billingCycle,
                            extraSeats,
                            amountVND,
                            status: 'PENDING',
                            expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
                        },
                        select: { id: true, paymentCode: true, expiresAt: true },
                    })
                } catch (e) {
                    if ((e as { code?: string })?.code !== 'P2002' || attempt === 2) throw e
                }
            }
            throw new Error('unreachable')
        })

        void audit({
            workspaceId,
            actorUserId: access.userId,
            action: 'billing.order_created',
            targetType: 'SubscriptionOrder',
            targetId: result.id,
            after: { planCode, billingCycle, extraSeats, amountVND, paymentCode: result.paymentCode },
        })

        return {
            success: true,
            checkout: {
                orderId: result.id,
                paymentCode: result.paymentCode,
                amountVND,
                planCode,
                billingCycle,
                extraSeats,
                expiresAt: result.expiresAt.toISOString(),
                payTo: {
                    bank: sepay.bank,
                    accountNumber: sepay.accountNumber,
                    qrUrl: buildSepayQrUrl(sepay, amountVND, result.paymentCode),
                },
            },
        }
    } catch (e) {
        console.error('[billing] createSubscriptionOrder:', e)
        return { error: e instanceof Error && e.message.startsWith('SECURITY_VIOLATION') ? 'Bạn không có quyền quản lý gói của tổ chức.' : 'Không tạo được đơn. Thử lại.' }
    }
}

/** Poll từ panel checkout (4s/lần). Tiện thể hết-hạn-hoá đơn PENDING quá TTL — lười mà đúng:
 *  không cần cron riêng cho việc này, đơn nào không ai nhìn thì webhook cũng từ chối theo expiresAt. */
export async function getOrderStatus(
    workspaceId: string,
    orderId: string,
): Promise<{ status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED'; planCode: string | null } | { error: string }> {
    try {
        await verifyProfileAdminAccess(workspaceId)
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) return { error: 'Workspace chưa gắn tổ chức.' }

        await prisma.subscriptionOrder.updateMany({
            where: { id: orderId, status: 'PENDING', expiresAt: { lt: new Date() } },
            data: { status: 'EXPIRED' },
        })

        const order = await prisma.subscriptionOrder.findFirst({
            // Ràng theo ownerProfileId — không bao giờ trả đơn của tổ chức khác dù đoán được id.
            where: { id: orderId, subscription: { ownerProfileId: profileId } },
            select: { status: true, planCode: true },
        })
        if (!order) return { error: 'Không tìm thấy đơn.' }
        return { status: order.status as 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELED', planCode: order.planCode }
    } catch {
        return { error: 'Không đọc được trạng thái đơn.' }
    }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Nhập code (profile admin)                                                 */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * D2 — nhập trial/gift code. Tất cả kiểm tra + trừ lượt chạy trong MỘT transaction dưới
 * advisory lock theo code: một code maxUses=1 mà hai tổ chức cùng bấm thì đúng một bên thắng.
 */
export async function redeemCode(
    workspaceId: string,
    rawCode: string,
): Promise<{ success: true; planCode: PlanCode; periodEnd: string } | { error: string }> {
    try {
        const access = await verifyProfileAdminAccess(workspaceId)
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) return { error: 'Workspace chưa gắn tổ chức.' }

        const compact = normalizeGiftCode(rawCode || '')
        if (compact.length < 8 || compact.length > 24) return { error: 'Code không đúng định dạng.' }

        const now = new Date()
        type RedeemTxResult = { error: string } | { ok: true; planCode: PlanCode; periodEnd: Date }
        const result = await prisma.$transaction(async (tx): Promise<RedeemTxResult> => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${compact}, 0))`

            // Code lưu dạng có gạch (VLX-XXXX-…) — so bằng bản đã bỏ gạch để khách gõ kiểu gì cũng trúng.
            const codes = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "RedemptionCode"
                WHERE REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') = ${compact}
                LIMIT 1`
            const codeRow = codes[0]
                ? await tx.redemptionCode.findUnique({ where: { id: codes[0].id } })
                : null
            if (!codeRow) return { error: 'Code không tồn tại. Kiểm tra lại từng ký tự (code không có số 0 và số 1).' } as const
            if (codeRow.revokedAt) return { error: 'Code này đã bị thu hồi.' } as const
            if (codeRow.redeemExpiresAt && now > codeRow.redeemExpiresAt) return { error: 'Code đã quá hạn nhập.' } as const
            if (codeRow.usedCount >= codeRow.maxUses) return { error: 'Code đã hết lượt dùng.' } as const
            if (!isSellablePlan(codeRow.planCode)) return { error: 'Code trỏ tới gói không còn tồn tại — liên hệ HustlyTasker.' } as const

            const already = await tx.codeRedemption.findUnique({
                where: { codeId_profileId: { codeId: codeRow.id, profileId } },
            })
            if (already) return { error: 'Tổ chức của bạn đã dùng code này rồi.' } as const

            const codePlan = codeRow.planCode as PlanCode
            const existing = await tx.subscription.findUnique({
                where: { ownerProfileId: profileId },
                select: { id: true, planCode: true, currentPeriodStart: true, currentPeriodEnd: true },
            })
            // Đang ACTIVE ở gói CAO hơn thì code gói thấp không áp được — áp là tự hạ gói giữa kỳ.
            if (
                existing?.currentPeriodEnd && now <= existing.currentPeriodEnd &&
                comparePlans(existing.planCode as PlanCode, codePlan) > 0
            ) {
                return { error: `Tổ chức đang ở gói ${getPlan(existing.planCode as PlanCode).label} cao hơn — code ${getPlan(codePlan).label} không áp được.` } as const
            }

            // Cộng NGÀY vào mốc muộn hơn giữa now và hạn hiện có (code chồng code = cộng dồn, D2).
            const base = existing?.currentPeriodEnd && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now
            const periodEnd = new Date(base.getTime() + codeRow.durationDays * 24 * 60 * 60 * 1000)

            const sub = existing
                ? await tx.subscription.update({
                    where: { id: existing.id },
                    data: {
                        planCode: codePlan,
                        status: 'ACTIVE',
                        currentPeriodStart: existing.currentPeriodStart ?? now,
                        currentPeriodEnd: periodEnd,
                        graceEndsAt: null,
                    },
                    select: { id: true },
                })
                : await tx.subscription.create({
                    data: {
                        ownerProfileId: profileId,
                        planCode: codePlan,
                        status: 'ACTIVE',
                        billingCycle: 'MONTHLY',
                        currentPeriodStart: now,
                        currentPeriodEnd: periodEnd,
                    },
                    select: { id: true },
                })

            await tx.profile.update({ where: { id: profileId }, data: { subscriptionId: sub.id } })
            // Trừ lượt CÓ ĐIỀU KIỆN — dòng phòng thủ cuối nếu lock bị bỏ qua ở refactor sau.
            const bumped = await tx.redemptionCode.updateMany({
                where: { id: codeRow.id, usedCount: { lt: codeRow.maxUses } },
                data: { usedCount: { increment: 1 } },
            })
            if (bumped.count === 0) return { error: 'Code đã hết lượt dùng.' } as const
            await tx.codeRedemption.create({
                data: { codeId: codeRow.id, profileId, subscriptionId: sub.id },
            })

            return { ok: true, planCode: codePlan, periodEnd } as const
        })

        if ('error' in result) return { error: result.error }

        void audit({
            workspaceId,
            actorUserId: access.userId,
            action: 'billing.code_redeemed',
            targetType: 'Profile',
            targetId: profileId,
            after: { planCode: result.planCode, periodEnd: result.periodEnd.toISOString() },
        })
        return { success: true, planCode: result.planCode, periodEnd: result.periodEnd.toISOString() }
    } catch (e) {
        console.error('[billing] redeemCode:', e)
        return { error: 'Không nhập được code. Thử lại.' }
    }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Trạng thái gói cho trang billing (profile admin)                          */
/* ────────────────────────────────────────────────────────────────────────── */

export async function getBillingOverview(workspaceId: string) {
    try {
        await verifyProfileAdminAccess(workspaceId)
        const profileId = await resolveWorkspaceProfileId(workspaceId)
        if (!profileId) return { error: 'Workspace chưa gắn tổ chức.' as const }
        const ent = await getEntitlements(profileId)
        // Serialize: Set/Date/bigint không qua nổi ranh giới RSC→client.
        return {
            success: true as const,
            entitlements: {
                planCode: ent.planCode,
                status: ent.status,
                readOnly: ent.readOnly,
                enforced: ent.enforced,
                daysLeft: ent.daysLeft,
                effectiveEnd: ent.effectiveEnd?.toISOString() ?? null,
                graceEndsAt: ent.graceEndsAt?.toISOString() ?? null,
                hasSubscription: ent.hasSubscription,
                seatLimit: ent.seatLimit,
                storageLimitBytes: ent.storageLimitBytes === null ? null : ent.storageLimitBytes.toString(),
                features: Array.from(ent.features),
            },
        }
    } catch {
        return { error: 'Không đọc được gói của tổ chức.' as const }
    }
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  Phát hành code (GLOBAL admin — chủ Velox, /billing-ops)                   */
/* ────────────────────────────────────────────────────────────────────────── */

async function requireGlobalAdmin(): Promise<{ userId: string }> {
    const s = await verifyActiveSession()
    if (s.status !== 'active' || !s.dbUser || s.dbUser.role !== 'ADMIN') {
        throw new Error('SECURITY_VIOLATION: Chỉ quản trị hệ thống mới phát hành code.')
    }
    return { userId: s.dbUser.id }
}

export async function createRedemptionCode(input: {
    planCode?: string
    durationDays?: number
    maxUses?: number
    redeemExpiresAt?: string | null
    note?: string
}): Promise<{ success: true; code: string } | { error: string }> {
    try {
        const { userId } = await requireGlobalAdmin()
        // Mặc định = bản mẫu trial (TRIAL config): AGENCY 14 ngày, 1 lượt.
        const planCode = input.planCode ?? TRIAL.planCode
        if (!isSellablePlan(planCode)) return { error: `Gói không bán qua code. Chọn một trong: ${SELLABLE_PLANS.join(', ')}.` }
        const durationDays = Math.floor(input.durationDays ?? TRIAL.days)
        if (durationDays < 1 || durationDays > 730) return { error: 'Số ngày phải trong khoảng 1–730.' }
        const maxUses = Math.floor(input.maxUses ?? 1)
        if (maxUses < 1 || maxUses > 10_000) return { error: 'Số lượt phải trong khoảng 1–10.000.' }
        const redeemExpiresAt = input.redeemExpiresAt ? new Date(input.redeemExpiresAt) : null
        if (redeemExpiresAt && Number.isNaN(redeemExpiresAt.getTime())) return { error: 'Hạn nhập không đúng định dạng ngày.' }

        for (let attempt = 0; attempt < 3; attempt++) {
            const code = newGiftCode()
            try {
                const row = await prisma.redemptionCode.create({
                    data: {
                        code,
                        planCode,
                        durationDays,
                        maxUses,
                        redeemExpiresAt,
                        note: (input.note ?? '').slice(0, 500) || null,
                        createdById: userId,
                    },
                    select: { id: true, code: true },
                })
                void audit({
                    workspaceId: null,
                    actorUserId: userId,
                    action: 'billing.code_created',
                    targetType: 'RedemptionCode',
                    targetId: row.id,
                    after: { planCode, durationDays, maxUses, note: input.note ?? null },
                })
                return { success: true, code: row.code }
            } catch (e) {
                if ((e as { code?: string })?.code !== 'P2002' || attempt === 2) throw e
            }
        }
        return { error: 'Không sinh được code — thử lại.' }
    } catch (e) {
        console.error('[billing] createRedemptionCode:', e)
        return { error: e instanceof Error && e.message.startsWith('SECURITY_VIOLATION') ? 'Chỉ quản trị hệ thống mới phát hành code.' : 'Không tạo được code.' }
    }
}

export async function revokeRedemptionCode(codeId: string): Promise<{ success: true } | { error: string }> {
    try {
        const { userId } = await requireGlobalAdmin()
        const r = await prisma.redemptionCode.updateMany({
            where: { id: codeId, revokedAt: null },
            data: { revokedAt: new Date() },
        })
        if (r.count === 0) return { error: 'Code không tồn tại hoặc đã thu hồi.' }
        void audit({ workspaceId: null, actorUserId: userId, action: 'billing.code_revoked', targetType: 'RedemptionCode', targetId: codeId })
        return { success: true }
    } catch {
        return { error: 'Không thu hồi được code.' }
    }
}

export async function listRedemptionCodes(): Promise<
    | { success: true; codes: Array<{ id: string; code: string; planCode: string; durationDays: number; maxUses: number; usedCount: number; redeemExpiresAt: string | null; note: string | null; revokedAt: string | null; createdAt: string; redemptions: Array<{ profileName: string; redeemedAt: string }> }> }
    | { error: string }
> {
    try {
        await requireGlobalAdmin()
        const rows = await prisma.redemptionCode.findMany({
            orderBy: { createdAt: 'desc' },
            take: 200,
            include: {
                redemptions: {
                    orderBy: { redeemedAt: 'desc' },
                    select: { redeemedAt: true, profile: { select: { name: true } } },
                },
            },
        })
        return {
            success: true,
            codes: rows.map((r) => ({
                id: r.id,
                code: r.code,
                planCode: r.planCode,
                durationDays: r.durationDays,
                maxUses: r.maxUses,
                usedCount: r.usedCount,
                redeemExpiresAt: r.redeemExpiresAt?.toISOString() ?? null,
                note: r.note,
                revokedAt: r.revokedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                redemptions: r.redemptions.map((d) => ({ profileName: d.profile.name, redeemedAt: d.redeemedAt.toISOString() })),
            })),
        }
    } catch {
        return { error: 'Không đọc được danh sách code.' }
    }
}
