/**
 * [Tra cứu] Lấy các mảnh dữ liệu THẬT cần cho hóa đơn của Archie — chỉ đọc.
 * agencyName (Profile.name), hồ sơ thanh toán mặc định (BillingProfile),
 * depositBalance của client, và mã hóa đơn kế tiếp chưa trùng.
 */
import { prisma } from '../../src/lib/db'

async function main() {
    const profileId = '61f25775-eb95-4ece-96e8-99ae97542af1'

    const profile = await prisma.profile.findUnique({ where: { id: profileId }, select: { name: true } })
    console.log('Profile.name (agencyName):', JSON.stringify(profile?.name))

    const billing = await prisma.billingProfile.findMany({
        where: { profileId },
        orderBy: { isDefault: 'desc' },
    })
    console.log('\nBillingProfile:')
    for (const b of billing) {
        console.log(`  [${b.isDefault ? 'MẶC ĐỊNH' : ''}] ${b.profileName}`)
        console.log(`    beneficiaryName=${b.beneficiaryName} bankName=${b.bankName} accountNumber=${b.accountNumber}`)
        console.log(`    swiftCode=${b.swiftCode ?? '—'} address=${b.address ?? '—'} currency=${b.currency ?? '—'}`)
        console.log(`    notes=${b.notes ?? '—'}`)
    }

    const client = await prisma.client.findUnique({ where: { id: 196 }, select: { name: true, depositBalance: true, tier: true } })
    console.log('\nClient 196:', client)

    const existing = await prisma.invoice.findMany({
        where: { invoiceNumber: { startsWith: `INV-${new Date().getFullYear()}` } },
        select: { invoiceNumber: true },
    })
    console.log(`\n${existing.length} invoiceNumber đã dùng trong năm nay:`, existing.map((i) => i.invoiceNumber).join(', ') || '(chưa có)')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
