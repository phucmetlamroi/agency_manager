/**
 * Ba task dùng-một-lần cho việc nghiệm thu Phase C — CHỈ trên nhánh thử nghiệm.
 *
 *   npx tsx scripts/audit-2026-07/seed-phase-c.ts          # tạo
 *   npx tsx scripts/audit-2026-07/seed-phase-c.ts --clean  # xoá sạch
 *
 * ─── VÌ SAO CẦN ────────────────────────────────────────────────────────────
 * Tài khoản audit_staff.3 không được giao task nào, nên màn Bảng điều khiển của
 * nó luôn rơi vào nhánh "chưa có task nào" — không thể kiểm hai nhánh rỗng còn
 * lại (lọc không ra / tab rỗng), cũng không có nút "Bắt đầu" nào để thử khi mất
 * mạng.
 *
 * KHÔNG mượn tài khoản của người thật (dù chỉ trên bản sao) — đúng nguyên tắc đã
 * ghi trong mint-sessions.ts. Thay vào đó tạo task riêng, có dấu, và xoá được.
 *
 * Mọi dòng đều mang tiền tố `[KIỂM TOÁN]` trong tiêu đề; --clean xoá đúng chúng.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const MARK = '[KIỂM TOÁN] '
const WORKSPACE_ID = '54917a49-a989-4fcb-9108-e44322016f7f'
const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

function envValue(file: string, key: string): string {
    const raw = readFileSync(join(process.cwd(), file), 'utf8')
    const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm'))
    if (!m) throw new Error(`${key} không có trong ${file}`)
    return m[1].trim().replace(/^["']|["']$/g, '')
}

const url = envValue('.env.local', 'DATABASE_URL')
if (!url.includes('round-lab') || url.includes('autumn-flower')) {
    console.error('DỪNG: chỉ được chạy trên nhánh thử nghiệm "round-lab".')
    process.exit(1)
}
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] })

async function clean() {
    const r = await db.task.deleteMany({ where: { title: { startsWith: MARK } } })
    console.log(`Đã xoá ${r.count} task kiểm toán.`)
}

async function main() {
    if (process.argv.includes('--clean')) return clean()

    const staff = await db.user.findFirst({ where: { username: 'audit_staff.3' }, select: { id: true } })
    if (!staff) throw new Error('Không thấy audit_staff.3 — chạy mint-sessions.ts trước.')

    await clean()

    // Cố ý cùng MỘT trạng thái cho cả ba: như vậy 5 tab còn lại đều rỗng, đúng
    // nhánh "Không có task nào ở trạng thái này" cần kiểm.
    const rows = [
        { title: `${MARK}Dựng video mở màn`, status: 'Nhận task' },
        { title: `${MARK}Cắt teaser 15 giây`, status: 'Nhận task' },
        { title: `${MARK}Lồng phụ đề tập 2`, status: 'Nhận task' },
    ]
    for (const r of rows) {
        await db.task.create({
            data: {
                title: r.title,
                status: r.status,
                assigneeId: staff.id,
                workspaceId: WORKSPACE_ID,
                profileId: PROFILE_ID,
            },
        })
    }
    console.log(`Đã tạo ${rows.length} task cho audit_staff.3 (trạng thái "Nhận task").`)
    console.log('Dọn sạch khi xong:  npx tsx scripts/audit-2026-07/seed-phase-c.ts --clean')
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
