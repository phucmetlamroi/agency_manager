/**
 * [BILLING P1.5] ĐO THỬ — trả lời câu "bật khoá hạn mức thì ai bị chặn?"
 *
 * CHỈ ĐỌC TUYỆT ĐỐI. Không một lệnh ghi nào: chỉ count() và $queryRaw SELECT. Chạy được trên
 * database thật mà không đổi một byte dữ liệu nào.
 *
 * Vì sao cần bước này trước khi cắm chốt chặn: theo tài liệu giá, chính đội của chủ sản phẩm
 * đang dùng ở mức vượt xa trần gói Free. Bật chặn mà chưa biết con số thật thì cách phát hiện
 * sai sót sẽ là khách gọi điện báo hỏng.
 *
 * Cách chạy:
 *   npx tsx scripts/billing/measure-usage.ts
 *
 * Script IN RA máy chủ database trước khi làm gì — hãy nhìn dòng đó và xác nhận đúng database
 * bạn định đo. `DATABASE_URL` lấy từ môi trường / .env (Prisma KHÔNG đọc .env.local).
 */
import { PrismaClient } from '@prisma/client'
import {
    PLANS,
    PLAN_ORDER,
    effectiveSeatLimit,
    isUnlimited,
    type PlanCode,
} from '../../src/lib/billing/plans'

const prisma = new PrismaClient()

// Dấu hiệu nhận biết database production, lấy từ scripts/maybe-db-push.mjs để hai nơi
// hiểu "production" giống nhau.
const PRODUCTION_MARKER = 'ep-autumn-flower'

function dbHost(): string {
    try {
        const u = process.env.DATABASE_URL || ''
        return u ? new URL(u).host : '(chưa đặt DATABASE_URL)'
    } catch {
        return '(DATABASE_URL không phân tích được)'
    }
}

function fmtBytes(b: bigint): string {
    const n = Number(b)
    if (n < 1_000_000) return `${(n / 1_000).toFixed(0)} KB`
    if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(0)} MB`
    if (n < 1_000_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`
    return `${(n / 1_000_000_000_000).toFixed(2)} TB`
}

function pad(s: string, w: number): string {
    // Cắt theo ký tự hiển thị, đủ dùng cho bảng trong terminal.
    return s.length >= w ? s.slice(0, w - 1) + '…' : s + ' '.repeat(w - s.length)
}

/** Gói THẤP NHẤT chứa vừa mức dùng này. `null` = vượt cả Enterprise (không thể xảy ra). */
function smallestFittingPlan(seats: number, bytes: bigint): PlanCode | null {
    for (const code of PLAN_ORDER) {
        const seatLimit = effectiveSeatLimit(code)
        const storeLimit = PLANS[code].limits.storageBytes
        const seatsOk = isUnlimited(seatLimit) || seats <= seatLimit
        const storeOk = isUnlimited(storeLimit) || bytes <= storeLimit
        if (seatsOk && storeOk) return code
    }
    return null
}

async function main() {
    const host = dbHost()
    const isProd = host.includes(PRODUCTION_MARKER)
    console.log('')
    console.log('═'.repeat(78))
    console.log(`  DATABASE: ${host}`)
    if (isProd) console.log('  ⚠  ĐÂY LÀ DATABASE PRODUCTION. Script chỉ đọc, không ghi gì.')
    console.log('═'.repeat(78))
    console.log('')

    const profiles = await prisma.profile.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
    })

    if (!profiles.length) {
        console.log('Không có tổ chức nào đang hoạt động.')
        return
    }

    type Row = {
        name: string
        seats: number
        live: bigint
        trashed: bigint
        total: bigint
        workspaces: number
        fitByLive: PlanCode | null
        fitByTotal: PlanCode | null
    }
    const rows: Row[] = []

    for (const p of profiles) {
        // Mệnh đề đếm ghế PHẢI khớp countBillableSeats trong src/lib/billing/usage.ts.
        // Viết lại ở đây thay vì import vì usage.ts dùng bí danh '@/lib/db' của Next.
        // Sửa một bên thì PHẢI sửa bên kia — nếu hai con số lệch nhau thì đây là chỗ đầu tiên phải xem.
        const seats = await prisma.user.count({
            where: {
                role: { notIn: ['LOCKED', 'CLIENT'] },
                OR: [
                    { profileId: p.id },
                    { profileAccesses: { some: { profileId: p.id, role: { not: 'CLIENT' } } } },
                ],
                NOT: { profileAccesses: { some: { profileId: p.id, role: 'CLIENT' } } },
            },
        })

        const [agg] = await prisma.$queryRaw<{ live: string; trashed: string }[]>`
            SELECT
                COALESCE(SUM(CASE WHEN v."deletedAt" IS NULL     THEN v."sizeBytes" ELSE 0 END), 0)::text AS live,
                COALESCE(SUM(CASE WHEN v."deletedAt" IS NOT NULL THEN v."sizeBytes" ELSE 0 END), 0)::text AS trashed
            FROM "ReviewVersion" v
            JOIN "Workspace" w ON w.id = v."workspaceId"
            WHERE w."profileId" = ${p.id}
        `
        const live = BigInt(agg?.live ?? '0')
        const trashed = BigInt(agg?.trashed ?? '0')
        const total = live + trashed
        const workspaces = await prisma.workspace.count({ where: { profileId: p.id, status: 'ACTIVE' } })

        rows.push({
            name: p.name,
            seats,
            live,
            trashed,
            total,
            workspaces,
            fitByLive: smallestFittingPlan(seats, live),
            fitByTotal: smallestFittingPlan(seats, total),
        })
    }

    console.log(`TỔ CHỨC ĐANG HOẠT ĐỘNG: ${rows.length}`)
    console.log('')
    console.log(
        pad('Tên', 24) + pad('Ghế', 6) + pad('Đang thấy', 12) + pad('Thùng rác', 12) +
        pad('Tổng', 12) + pad('WS', 5) + 'Gói nhỏ nhất vừa',
    )
    console.log('─'.repeat(96))
    for (const r of rows) {
        // Hai cột "gói vừa" khác nhau = quyết định "tính hay không tính byte thùng rác"
        // ĐỔI TIỀN THẬT của tổ chức này. Đánh dấu để không ai lướt qua.
        const fit =
            r.fitByLive === r.fitByTotal
                ? (r.fitByLive ?? '—')
                : `${r.fitByLive ?? '—'} → ${r.fitByTotal ?? '—'}  ⚠ lệch do thùng rác`
        console.log(
            pad(r.name, 24) + pad(String(r.seats), 6) + pad(fmtBytes(r.live), 12) +
            pad(fmtBytes(r.trashed), 12) + pad(fmtBytes(r.total), 12) + pad(String(r.workspaces), 5) + fit,
        )
    }

    // ── Byte mồ côi ─────────────────────────────────────────────────────────
    const [orphan] = await prisma.$queryRaw<{ bytes: string; cnt: number }[]>`
        SELECT COALESCE(SUM(v."sizeBytes"), 0)::text AS bytes, COUNT(*)::int AS cnt
        FROM "ReviewVersion" v
        JOIN "Workspace" w ON w.id = v."workspaceId"
        WHERE w."profileId" IS NULL
    `
    const orphanBytes = BigInt(orphan?.bytes ?? '0')
    console.log('')
    if (orphanBytes > BigInt(0)) {
        console.log(
            `⚠  BYTE MỒ CÔI: ${fmtBytes(orphanBytes)} trên ${orphan?.cnt ?? 0} phiên bản nằm ở workspace ` +
            `KHÔNG thuộc tổ chức nào (Workspace.profileId = NULL).`,
        )
        console.log(
            '   Số này lọt khỏi MỌI bộ đếm theo tổ chức nhưng R2 vẫn tính tiền. Phải vá dữ liệu ' +
            'trước khi bật chặn, không thì tổng cộng lại sẽ không khớp hoá đơn.',
        )
    } else {
        console.log('✓  Không có byte mồ côi — mọi workspace đều thuộc về một tổ chức.')
    }

    // ── Ai bị chặn nếu bật khoá ngay hôm nay ────────────────────────────────
    console.log('')
    console.log('NẾU BẬT KHOÁ NGAY MÀ KHÔNG CẤP NGOẠI LỆ:')
    const freeSeat = effectiveSeatLimit('FREE')
    const freeStore = PLANS.FREE.limits.storageBytes
    let blocked = 0
    for (const r of rows) {
        const overSeat = !isUnlimited(freeSeat) && r.seats > freeSeat
        const overStore = !isUnlimited(freeStore) && r.total > freeStore
        if (!overSeat && !overStore) continue
        blocked++
        const bits: string[] = []
        if (overSeat) bits.push(`ghế ${r.seats}/${freeSeat}`)
        if (overStore) bits.push(`dung lượng ${fmtBytes(r.total)}/${fmtBytes(freeStore as bigint)}`)
        console.log(`  • ${r.name} — vượt gói Free: ${bits.join(', ')} → cần gói ${r.fitByTotal ?? '?'}`)
    }
    if (!blocked) console.log('  (không tổ chức nào vượt gói Free)')
    else {
        console.log('')
        console.log(
            `  ${blocked}/${rows.length} tổ chức sẽ bị chặn. Mỗi tổ chức trong danh sách này cần MỘT ` +
            'quyết định: nâng gói, cấp ngoại lệ vĩnh viễn, hay để bị chặn thật.',
        )
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error('LỖI:', e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
