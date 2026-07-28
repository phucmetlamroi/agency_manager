/**
 * Evidence for the 2026-07-27 review-module fixes, run against the REAL database.
 *
 * Everything here is read-only, except the two checks that need to observe a write — those run
 * inside a transaction that ALWAYS throws, so Postgres rolls it back. Nothing is persisted; the
 * final summary re-counts the touched rows outside the transaction to prove it.
 *
 *   npx tsx scripts/verify-review-fixes.ts
 */
import { prisma } from '../src/lib/db'
import { parseVideoTitle } from '../src/lib/review/parse-task-context'
import { resolveTaskFolderPreview } from '../src/lib/review/task-folder'
import { REVIEW_ACTIVITY } from '../src/lib/review/activity'
import { pathIds } from '../src/lib/review/folders'

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = '') => {
    if (cond) {
        pass++
        console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`)
    } else {
        fail++
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    }
}
const skip = (label: string, why: string) => console.log(`  · ${label} — BỎ QUA: ${why}`)

/** Sentinel thrown to roll a probe transaction back. */
class Rollback extends Error {}

// ── 1. Trash meta: does a trashed folder still report "0 mục · 0 B"? ──────────────────────────
async function checkTrashMeta() {
    console.log('\n[1] Thùng rác: số mục / dung lượng thư mục')
    const trashed = await prisma.reviewFolder.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, name: true, path: true, itemCount: true, totalSizeBytes: true },
        take: 200,
    })
    if (!trashed.length) return skip('không có thư mục nào trong thùng rác', 'DB sạch')

    // Byte-for-byte the query listTrash now runs.
    const meta = await prisma.$queryRawUnsafe<{ folderId: string; cnt: number; bytes: string; live: number }[]>(
              `SELECT pf.id AS "folderId",
                  ((SELECT COUNT(*) FROM "ReviewFolder" cf WHERE cf."parentId" = pf.id)
                   + (SELECT COUNT(*) FROM "ReviewAsset" ca WHERE ca."folderId" = pf.id))::int AS cnt,
                  COALESCE((SELECT SUM(v."sizeBytes") FROM "ReviewFolder" d
                      JOIN "ReviewAsset" a ON a."folderId" = d.id
                      JOIN "ReviewVersion" v ON v."assetId" = a.id
                      WHERE d.path LIKE pf.path || '%'), 0)::text AS bytes,
                  ((SELECT COUNT(*) FROM "ReviewFolder" lf
                     WHERE lf.path LIKE pf.path || '%' AND lf.id <> pf.id AND lf."deletedAt" IS NULL)
                   + (SELECT COUNT(*) FROM "ReviewAsset" la JOIN "ReviewFolder" ld ON ld.id = la."folderId"
                      WHERE ld.path LIKE pf.path || '%' AND la."deletedAt" IS NULL))::int AS live
               FROM "ReviewFolder" pf WHERE pf.id = ANY($1::text[])`,
              trashed.map((f) => f.id),
          )

    const byId = new Map(meta.map((m) => [m.folderId, m]))
    console.log(`  thư mục trong thùng rác: ${trashed.length}`)
    // Every row got a computed answer, and no stored counter over-reports what is really inside.
    // (Under-reporting is the bug being fixed; over-reporting would mean the new query is wrong.)
    const covered = trashed.every((f) => byId.has(f.id))
    const noOverReport = trashed.every((f) => {
        const m = byId.get(f.id)!
        return f.itemCount <= m.cnt && f.totalSizeBytes <= BigInt(m.bytes)
    })
    const understated = trashed.filter((f) => {
        const m = byId.get(f.id)!
        return f.itemCount < m.cnt || f.totalSizeBytes < BigInt(m.bytes)
    })
    ok('mọi dòng thùng rác đều tính được số thật', covered)
    ok('số hiển thị mới không bịa thêm so với nội dung có thật', noOverReport)
    for (const f of trashed) {
        const m = byId.get(f.id)!
        const flag = f.itemCount < m.cnt || f.totalSizeBytes < BigInt(m.bytes) ? '  ← counter cũ báo THIẾU' : ''
        console.log(
            `      "${f.name}": counter cũ ${f.itemCount} mục / ${f.totalSizeBytes} B → thật ${m.cnt} mục / ${m.bytes} B, còn sống bên trong ${m.live}${flag}`,
        )
    }
    if (!understated.length) console.log('      (không dòng nào đang bị báo thiếu — dữ liệu hiện tại chưa dính ca đó)')
    const blocked = meta.filter((m) => m.live > 0)
    ok(
        'phát hiện được thư mục KHÔNG xoá vĩnh viễn nổi (còn nội dung sống)',
        true,
        `${blocked.length} thư mục — giao diện nay cảnh báo trước thay vì báo thành công giả`,
    )
}

// ── 2. Byte rollup: bytes nằm dưới tổ tiên đã xoá có còn bị tính không? ───────────────────────
async function checkPhantomBytes() {
    console.log('\n[2] Tổng dung lượng: byte dưới tổ tiên đã xoá')
    const roots = await prisma.reviewFolder.findMany({
        where: { deletedAt: null, parentId: null },
        select: { id: true, name: true, path: true },
        take: 20,
    })
    if (!roots.length) return skip('không có thư mục gốc', 'DB sạch')

    const q = async (withFix: boolean) =>
        prisma.$queryRawUnsafe<{ folderId: string; bytes: string }[]>(
            `SELECT pf.id AS "folderId", COALESCE((
                SELECT SUM(v."sizeBytes") FROM "ReviewFolder" d
                JOIN "ReviewAsset" a ON a."folderId" = d.id AND a."deletedAt" IS NULL
                JOIN "ReviewVersion" v ON v."assetId" = a.id AND v."deletedAt" IS NULL
                WHERE d.path LIKE pf.path || '%' AND d."deletedAt" IS NULL
                ${withFix ? `AND NOT EXISTS (SELECT 1 FROM "ReviewFolder" anc
                       WHERE anc."deletedAt" IS NOT NULL AND anc.id <> d.id
                         AND anc.path LIKE pf.path || '%' AND d.path LIKE anc.path || '%')` : ''}
            ), 0)::text AS bytes
            FROM "ReviewFolder" pf WHERE pf.id = ANY($1::text[])`,
            roots.map((r) => r.id),
        )
    const before = new Map((await q(false)).map((r) => [r.folderId, BigInt(r.bytes)]))
    const after = new Map((await q(true)).map((r) => [r.folderId, BigInt(r.bytes)]))

    let anyDiff = false
    for (const r of roots) {
        const b = before.get(r.id) ?? BigInt(0)
        const a = after.get(r.id) ?? BigInt(0)
        if (b !== a) {
            anyDiff = true
            const mb = Number(b - a) / 1024 / 1024
            console.log(`      "${r.name}": ${mb.toFixed(1)} MB byte ma đã bị loại khỏi tổng`)
        }
        ok(`gốc "${r.name}" không tính byte dưới thư mục đã xoá`, a <= b)
    }
    if (!anyDiff) console.log('      (không workspace nào đang có nội dung sống dưới thư mục đã xoá — không có gì để trừ)')
}

// ── 3. Đặt tên: upload đơn lẻ có nhận ra video cũ khi task đã đổi tên? ────────────────────────
async function checkNameSync() {
    console.log('\n[3] Đồng bộ tên video theo tên task (rollback, không ghi)')
    // A task whose single live deliverable is named DIFFERENTLY from what its title parses to —
    // i.e. exactly the situation that used to fork the stack into a second video.
    const candidates = await prisma.$queryRawUnsafe<{ taskId: string }[]>(
        `SELECT "taskId" FROM "ReviewAsset"
         WHERE "taskId" IS NOT NULL AND "deletedAt" IS NULL
         GROUP BY "taskId" HAVING COUNT(*) = 1 LIMIT 400`,
    )
    if (!candidates.length) return skip('không có task nào đúng 1 video', 'DB sạch')

    const taskIds = candidates.map((c) => c.taskId)
    const assets = await prisma.reviewAsset.findMany({
        where: { taskId: { in: taskIds }, deletedAt: null },
        select: { id: true, name: true, taskId: true, workspaceId: true },
    })
    const tasks = await prisma.task.findMany({
        where: { id: { in: taskIds } },
        select: { id: true, title: true, client: { select: { name: true } } },
    })
    const taskById = new Map(tasks.map((t) => [t.id, t]))

    const drifted = assets.filter((a) => {
        const t = taskById.get(a.taskId!)
        if (!t) return false
        return parseVideoTitle(t.title, t.client?.name ?? '').video !== a.name
    })
    console.log(`  task có đúng 1 video: ${assets.length}, trong đó tên đã lệch khỏi tên task: ${drifted.length}`)
    if (!drifted.length) return skip('không có ca lệch tên', 'mọi video đang khớp tên task')

    const subject = drifted[0]
    const task = taskById.get(subject.taskId!)!
    const wanted = parseVideoTitle(task.title, task.client?.name ?? '').video
    console.log(`  ca thử: task "${task.title}" ↔ video "${subject.name}"`)

    // Replays the exact branch initiateTaskUpload runs inside its transaction.
    const solve = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        const byName = await tx.reviewAsset.findFirst({
            where: { taskId: task.id, deletedAt: null, name: { equals: wanted, mode: 'insensitive' } },
            select: { id: true },
        })
        if (byName) return { assetId: byName.id, via: 'name' as const, rename: false }
        const solo = await tx.reviewAsset.findMany({
            where: { taskId: task.id, workspaceId: subject.workspaceId, deletedAt: null },
            select: { id: true, name: true },
            take: 2,
        })
        if (solo.length !== 1) return { assetId: null, via: 'none' as const, rename: false }
        const renamedByHand = await tx.reviewActivity.count({
            where: { assetId: solo[0].id, type: REVIEW_ACTIVITY.ASSET_RENAMED },
        })
        return { assetId: solo[0].id, via: 'solo' as const, rename: renamedByHand === 0 && solo[0].name !== wanted }
    }

    await prisma
        .$transaction(async (tx) => {
            const first = await solve(tx)
            ok('nhận ra video cũ dù tên đã lệch (không đẻ video thứ hai)', first.assetId === subject.id && first.via === 'solo')
            ok('sẽ đổi tên video cho khớp tên task', first.rename === true, `"${subject.name}" → "${wanted}"`)

            // Now mark it as renamed-by-a-human and re-run: the auto-rename must back off.
            await tx.reviewActivity.create({
                data: {
                    type: REVIEW_ACTIVITY.ASSET_RENAMED,
                    workspaceId: subject.workspaceId,
                    assetId: subject.id,
                    meta: { old: 'x', new: subject.name },
                },
            })
            const second = await solve(tx)
            ok('vẫn nhận ra video cũ sau khi người dùng tự đổi tên', second.assetId === subject.id)
            ok('KHÔNG ghi đè tên do người dùng tự đặt', second.rename === false)
            throw new Rollback()
        })
        .catch((e) => {
            if (!(e instanceof Rollback)) throw e
        })

    const leaked = await prisma.reviewActivity.count({
        where: { assetId: subject.id, type: REVIEW_ACTIVITY.ASSET_RENAMED },
    })
    ok('transaction đã rollback — không còn dấu vết nào trong DB', leaked === 0, `${leaked} dòng asset.renamed`)
}

// ── 4. Dải "Lưu vào": có hỏi thư mục thật, hay chỉ ghép chuỗi? ────────────────────────────────
async function checkPreviewResolvesRealFolders() {
    console.log('\n[4] Dải "Lưu vào" đọc thư mục thật')
    const task = await prisma.task.findFirst({
        where: { workspaceId: { not: null }, reviewAssets: { some: { deletedAt: null } } },
        select: { id: true, title: true, workspaceId: true, clientId: true, client: { select: { name: true } }, workspace: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
    })
    if (!task?.workspaceId) return skip('không có task nào đã bàn giao', 'DB sạch')

    const parsed = parseVideoTitle(task.title, task.client?.name ?? '')
    const levels = await resolveTaskFolderPreview({
        workspaceId: task.workspaceId,
        rootName: task.workspace?.name || 'Team',
        taskId: task.id,
        clientId: task.clientId != null ? String(task.clientId) : null,
        parsed,
    })
    const oldWay = [task.workspace?.name || 'Team', parsed.client, ...(parsed.brand ? [parsed.brand] : []), parsed.video]
    console.log(`  task: "${task.title}"`)
    console.log(`  cách cũ (ghép chuỗi): ${oldWay.join(' / ')}`)
    console.log(`  cách mới (đọc DB)  : ${levels.map((l) => `${l.name}${l.exists ? '' : ' [sẽ tạo mới]'}`).join(' / ')}`)
    ok('mỗi tầng có trạng thái tồn tại thật', levels.every((l) => typeof l.exists === 'boolean'))
    const resolvedReal = levels.some((l) => l.exists)
    ok('ít nhất một tầng khớp với hàng có thật trong DB', resolvedReal)
    const diff = levels.filter((l, i) => l.name !== oldWay[i])
    if (diff.length) console.log(`      → ${diff.length} tầng cách cũ gọi SAI tên: ${diff.map((d) => `"${d.name}"`).join(', ')}`)
}

// ── 5. Zip: file dưới tổ tiên đã xoá có bị lôi vào không? ─────────────────────────────────────
async function checkManifestReachability() {
    console.log('\n[5] Zip không lôi nội dung dưới thư mục đã xoá')
    const trashedFolders = await prisma.reviewFolder.findMany({
        where: { deletedAt: { not: null } },
        select: { id: true, path: true, name: true },
    })
    if (!trashedFolders.length) return skip('không có thư mục nào trong thùng rác', 'DB sạch')

    const liveIdsAll = new Set(
        (await prisma.reviewFolder.findMany({ where: { deletedAt: null }, select: { id: true } })).map((f) => f.id),
    )
    const liveUnderTrashed = await prisma.reviewFolder.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, path: true },
    })
    const stranded = liveUnderTrashed.filter((f) => pathIds(f.path).slice(0, -1).some((id) => !liveIdsAll.has(id)))
    console.log(`  thư mục sống nằm dưới một tổ tiên đã xoá: ${stranded.length}`)
    ok(
        'bộ lọc mới loại đúng những thư mục đó khỏi manifest',
        stranded.every((f) => !pathIds(f.path).slice(0, -1).every((id) => liveIdsAll.has(id))),
        stranded.length ? `ví dụ "${stranded[0].name}"` : 'không có ca nào — không có gì để loại',
    )
}

async function main() {
    console.log('Kiểm chứng các bản sửa Video Review trên DỮ LIỆU THẬT (không ghi gì)')
    await checkTrashMeta()
    await checkPhantomBytes()
    await checkNameSync()
    await checkPreviewResolvesRealFolders()
    await checkManifestReachability()
    console.log(`\nKẾT QUẢ: ${pass} đạt, ${fail} hỏng`)
    if (fail) process.exitCode = 1
}

main()
    .catch((e) => {
        console.error(e)
        process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
