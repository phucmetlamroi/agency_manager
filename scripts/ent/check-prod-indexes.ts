/**
 * [Giải trí] CHỈ ĐỌC — liệt kê chỉ mục thật đang có trên production của
 * ReviewFolder/ReviewAsset, để đối chiếu với bản kế hoạch mà `prisma db push`
 * sắp áp. Mục đích: chắc chắn không có chỉ mục tạo bằng SQL TAY nào bị xoá mất.
 *
 * Chạy: DATABASE_URL="<chuỗi prod>" npx tsx scripts/ent/check-prod-indexes.ts
 * KHÔNG ghi gì vào database.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const rows = await prisma.$queryRaw<{ tablename: string; indexname: string; indexdef: string }[]>`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename IN ('ReviewFolder', 'ReviewAsset', 'ReviewVersion')
        ORDER BY tablename, indexname
    `
    console.log(`\nTổng ${rows.length} chỉ mục trên 3 bảng của module Tệp:\n`)
    for (const r of rows) {
        // Chỉ mục do Prisma quản lý có tên dạng "Bảng_cột_idx"/"_key"/"_pkey".
        const prismaShaped = /^"?[A-Za-z]+_[A-Za-z0-9_]+(_idx|_key|_pkey)$/.test(r.indexname)
        const partial = r.indexdef.includes(' WHERE ')
        const expression = /\(\s*(lower|upper)\s*\(/i.test(r.indexdef)
        const flag = !prismaShaped || partial || expression ? '  ⚠️ TAY' : '       '
        console.log(`${flag} ${r.tablename}.${r.indexname}`)
        if (!prismaShaped || partial || expression) console.log(`         ${r.indexdef}`)
    }

    const manual = rows.filter(
        (r) =>
            !/^"?[A-Za-z]+_[A-Za-z0-9_]+(_idx|_key|_pkey)$/.test(r.indexname) ||
            r.indexdef.includes(' WHERE ') ||
            /\(\s*(lower|upper)\s*\(/i.test(r.indexdef),
    )
    console.log(
        `\n⚠️ Có ${manual.length} chỉ mục KHÔNG do Prisma quản lý — `
        + `nếu prisma db push xoá chúng thì phải tạo lại bằng tay sau khi đẩy.\n`,
    )
    if (manual.length) console.log(manual.map((m) => m.indexdef).join(';\n') + ';')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
