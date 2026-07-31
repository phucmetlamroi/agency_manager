/**
 * PHASE 4 — what the Tệp tree ACTUALLY looks like on real agency data.
 *
 * Information architecture cannot be judged from a design mockup: it is judged from the shape the
 * data really takes. READ-ONLY, test branch only.
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const url = (() => {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    return raw.match(/^DATABASE_URL\s*=\s*(.*)$/m)![1].trim().replace(/^["']|["']$/g, '')
})()
if (!url.includes('round-lab') || url.includes('autumn-flower')) { console.error('DỪNG: không phải nhánh thử nghiệm.'); process.exit(1) }
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] })

async function main() {
    console.log('HÌNH THÙ THẬT CỦA MODULE TỆP — toàn hệ thống, dữ liệu thật\n')

    console.log('[1] QUY MÔ')
    const scale = await db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT 'thư mục sống' AS k, COUNT(*) AS n FROM "ReviewFolder" WHERE "deletedAt" IS NULL
        UNION ALL SELECT 'thư mục trong thùng rác', COUNT(*) FROM "ReviewFolder" WHERE "deletedAt" IS NOT NULL
        UNION ALL SELECT 'video sống', COUNT(*) FROM "ReviewAsset" WHERE "deletedAt" IS NULL
        UNION ALL SELECT 'video trong thùng rác', COUNT(*) FROM "ReviewAsset" WHERE "deletedAt" IS NOT NULL
        UNION ALL SELECT 'phiên bản video', COUNT(*) FROM "ReviewVersion"
        UNION ALL SELECT 'bình luận review', COUNT(*) FROM "ReviewComment"
        UNION ALL SELECT 'link chia sẻ', COUNT(*) FROM "ShareLink"`
    for (const r of scale) console.log(`  ${r.k.padEnd(26)} ${r.n}`)

    console.log('\n[2] ĐỘ SÂU CÂY THƯ MỤC — người dùng phải bấm bao nhiêu lần mới tới video')
    const depth = await db.$queryRaw<{ depth: number; n: bigint }[]>`
        SELECT depth, COUNT(*) AS n FROM "ReviewFolder" WHERE "deletedAt" IS NULL GROUP BY depth ORDER BY depth`
    for (const d of depth) console.log(`  cấp ${d.depth}: ${d.n} thư mục`)

    console.log('\n[3] SỐ MỤC TRONG MỘT THƯ MỤC — chỗ giao diện dễ vỡ nhất')
    const fan = await db.$queryRaw<{ folder: string; depth: number; sub: bigint; vids: bigint }[]>`
        SELECT f.name AS folder, f.depth,
               (SELECT COUNT(*) FROM "ReviewFolder" c WHERE c."parentId" = f.id AND c."deletedAt" IS NULL) AS sub,
               (SELECT COUNT(*) FROM "ReviewAsset" a WHERE a."folderId" = f.id AND a."deletedAt" IS NULL) AS vids
        FROM "ReviewFolder" f WHERE f."deletedAt" IS NULL
        ORDER BY (SELECT COUNT(*) FROM "ReviewFolder" c WHERE c."parentId" = f.id AND c."deletedAt" IS NULL)
               + (SELECT COUNT(*) FROM "ReviewAsset" a WHERE a."folderId" = f.id AND a."deletedAt" IS NULL) DESC
        LIMIT 8`
    for (const f of fan) console.log(`  "${f.folder}"`.padEnd(34) + `cấp ${f.depth} · ${f.sub} thư mục con + ${f.vids} video = ${Number(f.sub) + Number(f.vids)} mục`)

    console.log('\n[4] TÊN DÀI NHẤT — thử sức chịu đựng của bố cục')
    const longest = await db.$queryRaw<{ kind: string; name: string; len: number }[]>`
        SELECT 'thư mục' AS kind, name, LENGTH(name) AS len FROM "ReviewFolder" WHERE "deletedAt" IS NULL
        UNION ALL SELECT 'video', name, LENGTH(name) FROM "ReviewAsset" WHERE "deletedAt" IS NULL
        ORDER BY len DESC LIMIT 5`
    for (const l of longest) console.log(`  ${String(l.len).padStart(3)} ký tự (${l.kind}): "${l.name.slice(0, 78)}"`)

    // NOTE: the column is `statusId` — a nullable STRING holding a task-status label, not an enum.
    // My first attempt assumed `status` and the query failed loudly, which is how it should fail.
    console.log('\n[5] TRẠNG THÁI VIDEO — phân bố thật (cột statusId, kiểu chuỗi tự do)')
    const st = await db.$queryRaw<{ status: string; n: bigint }[]>`
        SELECT COALESCE("statusId", '(chưa đặt)') AS status, COUNT(*) AS n
        FROM "ReviewAsset" WHERE "deletedAt" IS NULL GROUP BY "statusId" ORDER BY n DESC`
    for (const r of st) console.log(`  ${r.status.padEnd(26)} ${r.n}`)

    console.log('\n[6] XỬ LÝ VIDEO — có video nào kẹt hoặc hỏng không')
    const pipe = await db.$queryRaw<{ s: string; n: bigint }[]>`
        SELECT COALESCE("pipelineStatus"::text, '(trống)') AS s, COUNT(*) AS n FROM "ReviewVersion" GROUP BY "pipelineStatus" ORDER BY n DESC`
    for (const r of pipe) console.log(`  ${r.s.padEnd(22)} ${r.n}`)

    console.log('\n[7] SỐ PHIÊN BẢN TRÊN MỖI VIDEO — vòng sửa thực tế dài bao nhiêu')
    const vers = await db.$queryRaw<{ nv: bigint; n: bigint }[]>`
        SELECT nv, COUNT(*) AS n FROM (
          SELECT a.id, COUNT(v.id) AS nv FROM "ReviewAsset" a
          LEFT JOIN "ReviewVersion" v ON v."assetId" = a.id
          WHERE a."deletedAt" IS NULL GROUP BY a.id) t
        GROUP BY nv ORDER BY nv`
    for (const r of vers) console.log(`  ${r.nv} phiên bản: ${r.n} video`)

    console.log('\n[8] VIDEO KHÔNG GẮN TASK — mồ côi thì hiện ở đâu?')
    const orphan = await db.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*) AS n FROM "ReviewAsset" WHERE "deletedAt" IS NULL AND ("taskId" IS NULL OR "taskId" = '')`
    console.log(`  ${orphan[0].n} video không gắn task nào`)

    console.log('\n[9] LINK CHIA SẺ CHO KHÁCH — bề mặt lộ ra ngoài')
    const sh = await db.$queryRaw<{ k: string; n: bigint }[]>`
        SELECT 'còn hiệu lực' AS k, COUNT(*) AS n FROM "ShareLink" WHERE "revokedAt" IS NULL
        UNION ALL SELECT 'đã thu hồi', COUNT(*) FROM "ShareLink" WHERE "revokedAt" IS NOT NULL`
    for (const r of sh) console.log(`  ${r.k.padEnd(16)} ${r.n}`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
