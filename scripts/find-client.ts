/**
 * [Tra cứu] Tìm khách theo tên trong hồ sơ Hustly Team + liệt kê task theo workspace.
 * Chỉ đọc. Bản dùng chung, thay cho các bản hardcode từng khách trước đây.
 *
 * Chạy: npx tsx scripts/ent/find-client.ts "<tên khách>"
 */
import { prisma } from '../../src/lib/db'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

const usd = (n: unknown) => {
    const v = Number(n ?? 0)
    return v > 0 ? `$${v.toFixed(2)}` : '—'
}

async function main() {
    const q = process.argv[2]
    if (!q) {
        console.error('Dùng: npx tsx scripts/ent/find-client.ts "<tên khách>"')
        process.exit(1)
    }

    const clients = await prisma.client.findMany({
        where: { profileId: PROFILE_ID, name: { contains: q, mode: 'insensitive' }, status: { not: 'MERGED' } },
        select: { id: true, name: true, parentId: true },
    })

    if (clients.length === 0) {
        console.log(`\nKhông tìm thấy khách nào tên chứa "${q}".\n`)
        return
    }

    for (const c of clients) {
        // Gộp client con vào khách gốc — thống nhất với cách tính chuẩn của hệ thống.
        const subs = await prisma.client.findMany({ where: { parentId: c.id }, select: { id: true, name: true } })
        const ids = [c.id, ...subs.map((s) => s.id)]

        const tasks = await prisma.task.findMany({
            where: { clientId: { in: ids } },
            orderBy: { createdAt: 'desc' },
            select: {
                title: true, status: true, type: true, jobPriceUSD: true, value: true,
                createdAt: true, invoiceStatus: true, workspaceId: true,
            },
        })

        console.log(`\n━━━ ${c.name} (id=${c.id}) — ${tasks.length} task ━━━`)
        if (subs.length) console.log(`    gộp cả ${subs.length} client con: ${subs.map((s) => s.name).join(', ')}`)
        if (tasks.length === 0) continue

        // Gom theo workspace: workspace ở đây đặt tên theo tháng, nên đây chính là
        // cách chia "tháng này / tháng trước" mà chủ hệ thống hay hỏi.
        const wsIds = [...new Set(tasks.map((t) => t.workspaceId).filter((x): x is string => !!x))]
        const wss = await prisma.workspace.findMany({ where: { id: { in: wsIds } }, select: { id: true, name: true, createdAt: true } })
        const byWs = new Map<string, typeof tasks>()
        for (const t of tasks) {
            const k = t.workspaceId ?? '(không có workspace)'
            byWs.set(k, [...(byWs.get(k) ?? []), t])
        }

        for (const [wsId, list] of [...byWs].sort((a, b) => {
            const wa = wss.find((w) => w.id === a[0])?.createdAt?.getTime() ?? 0
            const wb = wss.find((w) => w.id === b[0])?.createdAt?.getTime() ?? 0
            return wb - wa
        })) {
            const name = wss.find((w) => w.id === wsId)?.name ?? wsId
            const sum = list.reduce((s, t) => s + Number(t.jobPriceUSD ?? 0), 0)
            console.log(`\n  ▸ ${name}  —  ${list.length} task  ·  tổng ${usd(sum)}`)
            console.log(`    workspaceId = ${wsId}`)
            for (const t of list) {
                const billed = t.invoiceStatus === 'UNBILLED' ? 'chưa xuất HĐ' : t.invoiceStatus
                console.log(
                    `      ${t.createdAt.toISOString().slice(0, 10)}  ${usd(t.jobPriceUSD).padStart(8)}  ` +
                        `[${t.status.slice(0, 22).padEnd(22)}] ${billed.padEnd(13)} ${t.title.slice(0, 44)}`,
                )
            }
        }
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
