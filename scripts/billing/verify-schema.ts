/** [BILLING P1] CHỈ ĐỌC — xác nhận 5 bảng billing + cột Profile.subscriptionId tồn tại.
 *  Chạy: DATABASE_URL trỏ nhánh cần kiểm → npx tsx scripts/billing/verify-schema.ts */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const host = (() => { try { return new URL(process.env.DATABASE_URL || '').host } catch { return '?' } })()
    console.log(`DB: ${host}`)

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('Subscription','SubscriptionOrder','SubscriptionPayment','RedemptionCode','CodeRedemption')
        ORDER BY table_name`
    console.log('Bảng billing có mặt:', tables.map(t => t.table_name).join(', ') || '(KHÔNG CÓ)')

    const col = await prisma.$queryRaw<{ column_name: string; is_nullable: string }[]>`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Profile' AND column_name = 'subscriptionId'`
    console.log('Profile.subscriptionId:', col.length ? `có (nullable=${col[0].is_nullable})` : 'KHÔNG CÓ')

    const uniques = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public'
          AND (indexname LIKE '%provider_providerTxnId%' OR indexname LIKE '%codeId_profileId%'
               OR indexname LIKE '%paymentCode%' OR indexname LIKE '%ownerProfileId%')`
    console.log('Unique/index quan trọng:', uniques.map(u => u.indexname).join(', ') || '(KHÔNG CÓ)')

    const ok = tables.length === 5 && col.length === 1
    console.log(ok ? '\n✅ Schema billing ĐẦY ĐỦ trên nhánh này.' : '\n❌ THIẾU — xem lại db push.')
    if (!ok) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
