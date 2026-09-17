/** [BILLING P7 · D4] Cấp ngoại lệ cho 5 tổ chức đang dùng thật — chạy TAY, MỘT lần,
 *  sau khi schema đã push và TRƯỚC khi bật BILLING_ENFORCEMENT_START.
 *
 *  Quyết định 2026-08-03 (docs/billing/SCHEMA-DE-XUAT.md §0 D4):
 *    • Hustly Team (của owner)              → ngoại lệ VĨNH VIỄN mức Scale.
 *    • Vincent / Tobi / Audrey / Carpe Diem → ngoại lệ 12 THÁNG ở mức gói họ cần,
 *      vào thẳng không trial — thời gian thương lượng chuyển trả phí.
 *
 *  Chạy:  DATABASE_URL="<chuỗi>" npx tsx scripts/billing/grant-overrides.ts            (xem trước)
 *         DATABASE_URL="<chuỗi>" APPLY=1 npx tsx scripts/billing/grant-overrides.ts    (ghi thật)
 *  Idempotent: upsert theo ownerProfileId — chạy lại chỉ cập nhật, không nhân đôi.
 */
import { PrismaClient } from '@prisma/client'
import { gb, tb } from '../../src/lib/billing/plans'

const prisma = new PrismaClient()
const APPLY = process.env.APPLY === '1'

/** Khớp theo TÊN profile (con số đo 2026-07-31: Vincent 28 ghế, Hustly 18/72.9GB, Tobi 10,
 *  Audrey 9, Carpe Diem 9). Trần ghế đặt RỘNG hơn mức đo để không ai đụng trần ngay ngày đầu. */
const GRANTS: Array<{
    match: string
    planCode: 'AGENCY' | 'SCALE'
    overrideSeats: number
    overrideStorageBytes: bigint
    months: number | null // null = vĩnh viễn
    note: string
}> = [
    { match: 'Hustly', planCode: 'SCALE', overrideSeats: 40, overrideStorageBytes: tb(3), months: null, note: 'D4 2026-08-03: org của owner — ngoại lệ vĩnh viễn mức Scale.' },
    { match: 'Vincent', planCode: 'AGENCY', overrideSeats: 35, overrideStorageBytes: tb(1), months: 12, note: 'D4 2026-08-03: khách đang dùng (28 ghế) — 12 tháng thương lượng.' },
    { match: 'Tobi', planCode: 'AGENCY', overrideSeats: 15, overrideStorageBytes: gb(500), months: 12, note: 'D4 2026-08-03: khách đang dùng (10 ghế) — 12 tháng thương lượng.' },
    { match: 'Audrey', planCode: 'AGENCY', overrideSeats: 15, overrideStorageBytes: gb(500), months: 12, note: 'D4 2026-08-03: khách đang dùng (9 ghế) — 12 tháng thương lượng.' },
    { match: 'Carpe Diem', planCode: 'AGENCY', overrideSeats: 15, overrideStorageBytes: gb(500), months: 12, note: 'D4 2026-08-03: khách đang dùng (9 ghế) — 12 tháng thương lượng.' },
]

async function main() {
    const host = (() => { try { return new URL(process.env.DATABASE_URL || '').host } catch { return '?' } })()
    console.log(`DB: ${host}\nChế độ: ${APPLY ? '✍️  GHI THẬT (APPLY=1)' : '👀 xem trước (thêm APPLY=1 để ghi)'}\n`)

    for (const g of GRANTS) {
        const profiles = await prisma.profile.findMany({
            where: { name: { contains: g.match, mode: 'insensitive' }, status: 'ACTIVE' },
            select: { id: true, name: true },
        })
        if (profiles.length === 0) { console.warn(`✗ "${g.match}" — KHÔNG tìm thấy profile ACTIVE nào. Bỏ qua.`); continue }
        if (profiles.length > 1) {
            console.warn(`✗ "${g.match}" — khớp ${profiles.length} profile (${profiles.map((p) => p.name).join(' | ')}). MƠ HỒ → bỏ qua, sửa `
                + `match cho hẹp lại rồi chạy lần nữa.`)
            continue
        }
        const p = profiles[0]
        const overrideUntil = g.months === null ? null : new Date(Date.now() + g.months * 30 * 24 * 60 * 60 * 1000)
        console.log(`• ${p.name} → ${g.planCode}, ${g.overrideSeats} ghế, ${Number(g.overrideStorageBytes / gb(1))}GB, `
            + `${g.months === null ? 'VĨNH VIỄN' : `tới ${overrideUntil!.toISOString().slice(0, 10)}`}`)
        if (!APPLY) continue

        const sub = await prisma.subscription.upsert({
            where: { ownerProfileId: p.id },
            create: {
                ownerProfileId: p.id,
                planCode: g.planCode,
                status: 'ACTIVE',
                billingCycle: 'MONTHLY',
                overrideSeats: g.overrideSeats,
                overrideStorageBytes: g.overrideStorageBytes,
                overrideNote: g.note,
                overrideUntil,
            },
            update: {
                planCode: g.planCode,
                status: 'ACTIVE',
                graceEndsAt: null,
                overrideSeats: g.overrideSeats,
                overrideStorageBytes: g.overrideStorageBytes,
                overrideNote: g.note,
                overrideUntil,
            },
            select: { id: true },
        })
        await prisma.profile.update({ where: { id: p.id }, data: { subscriptionId: sub.id } })
        console.log(`  ✓ đã ghi (subscription ${sub.id})`)
    }
    console.log('\nXong. Kiểm lại bằng: npx tsx scripts/billing/measure-usage.ts')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
