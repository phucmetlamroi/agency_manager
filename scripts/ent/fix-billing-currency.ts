/**
 * [Sửa dữ liệu thật] Hồ sơ thanh toán "Daniel Hee" (profileId=Hustly Team) đang
 * lưu currency="USD" (chữ) thay vì "$" (ký hiệu) — hóa đơn in ra "USD40.00" thay
 * vì "$40.00". Ghi chú của chính hồ sơ ghi "Change your CURRENCY ----> USD",
 * nên đây nhiều khả năng là việc dở dang của chủ hệ thống.
 *
 * Chỉ sửa ĐÚNG MỘT trường, ĐÚNG MỘT hàng, có xác nhận trước/sau. Không đụng gì khác.
 *
 * Chạy: npx tsx scripts/ent/fix-billing-currency.ts
 */
import { prisma } from '../../src/lib/db'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

async function main() {
    const before = await prisma.billingProfile.findFirst({
        where: { profileId: PROFILE_ID, profileName: 'Daniel Hee' },
        select: { id: true, profileName: true, currency: true },
    })
    if (!before) throw new Error('Không tìm thấy hồ sơ thanh toán "Daniel Hee".')
    console.log(`\nTrước: ${before.profileName}  currency="${before.currency}"`)
    if (before.currency === '$') {
        console.log('Đã là "$" từ trước — không cần sửa.\n')
        return
    }

    const after = await prisma.billingProfile.update({
        where: { id: before.id },
        data: { currency: '$' },
        select: { id: true, profileName: true, currency: true },
    })
    console.log(`Sau:   ${after.profileName}  currency="${after.currency}"\n`)
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
