/**
 * Sprint A migration: chuyển task hiện ở status 'Review' sang 'Revision'.
 *
 * Lý do: Sprint A đơn giản hoá flow — bỏ status 'Review' (intermediate giữa
 * Đang thực hiện và Revision). Submit giờ đi thẳng Revision + clear deadline.
 * Task cũ ở 'Review' phải migrate để display đúng tab, đảm bảo deadline
 * cleared (tránh cron flag Quá hạn oan).
 *
 * Idempotent: chạy nhiều lần OK (chỉ scan task status='Review').
 *
 * Usage:
 *   npx tsx scripts/migrate-review-to-revision.ts
 *
 * Verify post-migration:
 *   psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Task\" WHERE status='Review';"
 *   → Expected: 0
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔄 Migrate task Review → Revision (Sprint A)\n')

    const before = await prisma.task.count({ where: { status: 'Review' } })
    console.log(`📊 Tasks hiện ở status='Review': ${before}`)

    if (before === 0) {
        console.log('✅ Không có task nào cần migrate. Skip.')
        return
    }

    const result = await prisma.task.updateMany({
        where: { status: 'Review' },
        data: {
            status: 'Revision',
            deadline: null,    // Match behavior khi chuyển → Revision (clear deadline)
        },
    })

    console.log(`✅ Migrated ${result.count} task(s) từ Review → Revision (deadline cleared)\n`)

    // Sanity check
    const remaining = await prisma.task.count({ where: { status: 'Review' } })
    if (remaining === 0) {
        console.log('✓ Verify: 0 task còn ở Review status.')
    } else {
        console.warn(`⚠️ Vẫn còn ${remaining} task ở Review — race condition? Chạy lại script.`)
    }
}

main()
    .catch((e) => {
        console.error('❌ Migration thất bại:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
