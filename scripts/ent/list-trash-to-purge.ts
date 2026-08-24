/**
 * [Cơ hội cuối] Liệt kê CHÍNH XÁC những gì review-janitor sắp xoá vĩnh viễn — chỉ đọc.
 *
 * Janitor xoá asset đã nằm thùng rác >30 ngày, mỗi đêm tối đa 25 (PURGE_BATCH).
 * Xoá thật khỏi Mux + R2, KHÔNG hoàn tác được. Đây là lần cuối nhìn thấy chúng
 * trước khi biến mất.
 *
 * Chạy: npx tsx scripts/ent/list-trash-to-purge.ts
 */
import { prisma } from '../../src/lib/db'

const PURGE_AGE_DAYS = 30
const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86400_000)

async function main() {
    const cutoff = new Date(Date.now() - PURGE_AGE_DAYS * 86400_000)

    const assets = await prisma.reviewAsset.findMany({
        where: { deletedAt: { lt: cutoff } },
        orderBy: { deletedAt: 'asc' },
        select: {
            id: true, name: true, mediaKind: true, deletedAt: true, deletedById: true,
            taskId: true,
            // workspaceId là String thường trên model này (không có quan hệ) —
            // tra tên workspace riêng ở dưới.
            workspaceId: true,
            folder: { select: { name: true } },
            versions: { select: { sizeBytes: true, muxAssetId: true, r2Key: true } },
        },
    })

    if (assets.length === 0) {
        console.log('\n✅ Thùng rác không có gì quá 30 ngày. Janitor sẽ không xoá gì.\n')
        return
    }

    // Ai đã xoá — tra tên cho dễ đối chiếu.
    const userIds = [...new Set(assets.map((a) => a.deletedById).filter((x): x is string => !!x))]
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, nickname: true },
    })
    const who = (id: string | null) => {
        if (!id) return '(không rõ)'
        const u = users.find((x) => x.id === id)
        return u?.displayName?.trim() || u?.nickname?.trim() || u?.username || id.slice(0, 8)
    }

    const wsIds = [...new Set(assets.map((a) => a.workspaceId).filter(Boolean))]
    const workspaces = await prisma.workspace.findMany({
        where: { id: { in: wsIds } },
        select: { id: true, name: true },
    })
    const wsName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id.slice(0, 8)

    let totalBytes = 0
    let muxCount = 0
    for (const a of assets) {
        for (const v of a.versions) {
            totalBytes += Number(v.sizeBytes ?? 0)
            if (v.muxAssetId) muxCount++
        }
    }

    console.log(`\n╔══ ${assets.length} MỤC SẮP BỊ XOÁ VĨNH VIỄN ══╗\n`)
    console.log(`  Dung lượng trên R2 : ${(totalBytes / 1e9).toFixed(2)} GB`)
    console.log(`  Asset trên Mux     : ${muxCount}`)
    console.log(`  Tốc độ xoá         : 25/đêm ⇒ cần ${Math.ceil(assets.length / 25)} đêm\n`)

    console.log('  Đã ở thùng rác  Loại   Người xoá         Workspace / Thư mục      Tên')
    console.log('  ' + '─'.repeat(96))
    for (const a of assets) {
        const d = String(daysSince(a.deletedAt!)).padStart(4)
        const kind = (a.mediaKind === 'VIDEO' ? 'video' : 'ảnh').padEnd(6)
        const loc = `${wsName(a.workspaceId)} / ${a.folder?.name ?? '?'}`.slice(0, 24).padEnd(24)
        console.log(`  ${d} ngày      ${kind} ${who(a.deletedById).padEnd(17)} ${loc} ${a.name.slice(0, 40)}`)
    }

    console.log('\n  ⚠️  Có cái nào xoá NHẦM thì khôi phục NGAY trong giao diện Tệp')
    console.log('      trước 03:00 sáng — sau đó không lấy lại được.\n')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
