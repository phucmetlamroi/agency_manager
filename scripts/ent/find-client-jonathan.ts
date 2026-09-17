/**
 * [Tra cứu] Khách "Jonathan" trong hồ sơ Hustly Team + task gần khớp "Ad set 7/22"
 * — chỉ đọc. Kiểm trước khi dựng hóa đơn: đây là dữ liệu THẬT trong hệ thống hay
 * chủ hệ thống đang cho số liệu tay (task chưa từng tạo trong app)?
 *
 * Chạy: npx tsx scripts/ent/find-client-jonathan.ts
 */
import { prisma } from '../../src/lib/db'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

async function main() {
    const candidates = await prisma.client.findMany({
        where: { profileId: PROFILE_ID, name: { contains: 'Jonathan', mode: 'insensitive' }, status: { not: 'MERGED' } },
        select: { id: true, name: true, parentId: true, depositBalance: true },
    })
    console.log(`\nClient khớp "Jonathan": ${candidates.length}`)
    for (const c of candidates) console.log(`  id=${c.id}  "${c.name}"  parentId=${c.parentId ?? '—'}  cọc=${c.depositBalance}`)

    if (candidates.length === 0) {
        console.log('\n  Không có client tên "Jonathan" trong hồ sơ này.\n')
    } else {
        for (const c of candidates) {
            const tasks = await prisma.task.findMany({
                where: { clientId: c.id },
                orderBy: { createdAt: 'desc' },
                select: { id: true, title: true, status: true, type: true, jobPriceUSD: true, createdAt: true, productLink: true },
            })
            console.log(`\n  Task của "${c.name}" (${tasks.length}):`)
            for (const t of tasks) {
                console.log(`    ${t.createdAt.toISOString().slice(0, 10)}  [${t.status}]  $${t.jobPriceUSD}  ${t.title}`)
            }
        }
    }

    // Tìm rộng hơn: task nào có tên gần giống "Ad set" hoặc "7/22", bất kể client nào,
    // trong toàn hồ sơ — phòng trường hợp task đã tạo nhưng gắn khách khác/lỗi chính tả.
    const wsIds = (await prisma.workspace.findMany({ where: { profileId: PROFILE_ID }, select: { id: true } })).map((w) => w.id)
    const nearTasks = await prisma.task.findMany({
        where: {
            OR: [{ title: { contains: 'Ad set', mode: 'insensitive' } }, { title: { contains: '7/22', mode: 'insensitive' } }],
            client: { profileId: PROFILE_ID },
        },
        select: { id: true, title: true, clientId: true, jobPriceUSD: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
    })
    console.log(`\nTask tên gần giống "Ad set" hoặc "7/22" trong hồ sơ (bất kể khách): ${nearTasks.length}`)
    for (const t of nearTasks) {
        const client = t.clientId ? await prisma.client.findUnique({ where: { id: t.clientId }, select: { name: true } }) : null
        console.log(`  ${t.createdAt.toISOString().slice(0, 10)}  client="${client?.name ?? '—'}"  $${t.jobPriceUSD}  ${t.title}`)
    }
    console.log('')
    void wsIds
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
