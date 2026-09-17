/**
 * [Giải trí] CHỈ ĐỌC — kiểm chứng sau khi đẩy schema lên production:
 *   1. 4 bảng mới + enum có mặt chưa
 *   2. 2 chỉ mục tạo bằng SQL TAY của module Tệp có còn sống không
 *   3. Dữ liệu cũ còn nguyên (đếm bản ghi các bảng chính)
 *
 * Chạy: DATABASE_URL="<chuỗi prod>" npx tsx scripts/ent/verify-prod-schema.ts
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const NEW_TABLES = ['EntVideo', 'EntSubtitle', 'EntAccessCode', 'EntUploadSession']
const MANUAL_INDEXES = ['review_folder_name_per_parent', 'review_asset_name_per_folder']

async function main() {
    let bad = 0

    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY(${NEW_TABLES})
    `
    console.log('\n── Bảng mới của kho phim ──')
    for (const t of NEW_TABLES) {
        const ok = tables.some((r) => r.table_name === t)
        if (!ok) bad++
        console.log(`  ${ok ? '✓' : '✗ THIẾU'} ${t}`)
    }

    const enums = await prisma.$queryRaw<{ enumlabel: string }[]>`
        SELECT e.enumlabel FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'EntCodeRole' ORDER BY e.enumsortorder
    `
    const enumOk = enums.length === 2
    if (!enumOk) bad++
    console.log(`  ${enumOk ? '✓' : '✗'} enum EntCodeRole = [${enums.map((e) => e.enumlabel).join(', ')}]`)

    console.log('\n── Chỉ mục SQL TAY của module Tệp (phải CÒN) ──')
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY(${MANUAL_INDEXES})
    `
    for (const name of MANUAL_INDEXES) {
        const ok = idx.some((r) => r.indexname === name)
        if (!ok) bad++
        console.log(`  ${ok ? '✓' : '✗ ĐÃ BỊ XOÁ — phải tạo lại'} ${name}`)
    }

    const pathIdx = await prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'ReviewFolder_path_idx'
    `
    const pathOk = pathIdx.length === 1 && pathIdx[0].indexdef.includes('varchar_pattern_ops')
    if (!pathOk) bad++
    console.log(`  ${pathOk ? '✓' : '✗'} ReviewFolder_path_idx (varchar_pattern_ops)`)

    console.log('\n── Dữ liệu cũ (phải KHÔNG đổi) ──')
    const [tasks, folders, assets, versions, users, subs] = await Promise.all([
        prisma.task.count(),
        prisma.reviewFolder.count(),
        prisma.reviewAsset.count(),
        prisma.reviewVersion.count(),
        prisma.user.count(),
        prisma.subscription.count(),
    ])
    console.log(`  Task ${tasks} · ReviewFolder ${folders} · ReviewAsset ${assets} · ReviewVersion ${versions}`)
    console.log(`  User ${users} · Subscription ${subs}`)

    console.log(`\n${bad === 0 ? '✅ TẤT CẢ ĐẠT' : `❌ ${bad} mục KHÔNG đạt`}\n`)
    process.exit(bad === 0 ? 0 : 1)
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
