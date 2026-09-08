/**
 * [Tra cứu] Khách "Archie" ở workspace Hustly Team — mọi video đã làm + giá.
 * Chỉ đọc.
 *
 * Client giờ scope theo PROFILE (canonical), không theo workspaceId — theo đúng
 * ghi chú trong schema.prisma (Canonical Clients 2026-06). Nên cách tìm đúng là:
 *   workspace tên chứa "Hustly Team" → lấy profileId của nó
 *   → tìm Client tên chứa "Archie" trong đúng profileId đó
 *   → cộng cả client con (subsidiaries) nếu Archie là công ty mẹ có nhiều nhánh
 *   → liệt kê Task theo clientId (kể cả các client con), sắp theo ngày tạo
 *
 * Chạy: npx tsx scripts/ent/find-client-archie.ts
 */
import { prisma } from '../../src/lib/db'

function vnd(n: unknown): string {
    const num = Number(n ?? 0)
    return num.toLocaleString('vi-VN') + 'đ'
}
function usd(n: unknown): string {
    const num = Number(n ?? 0)
    return num > 0 ? `$${num.toFixed(2)}` : '—'
}

async function main() {
    let ws = await prisma.workspace.findMany({
        where: { name: { contains: 'Hustly Team', mode: 'insensitive' } },
        select: { id: true, name: true, profileId: true },
    })
    if (ws.length === 0) {
        // Không có workspace ĐẶT TÊN "Hustly Team" — nhưng hồ sơ chính của chủ hệ
        // thống (workspace theo từng tháng: "August/2026", "July/2026", ...) đều
        // dùng chung MỘT profileId. Đó chính là "Hustly Team" theo cách gọi thường
        // ngày, chỉ là hệ thống đặt tên workspace theo tháng chứ không theo team.
        console.log('\nKhông có workspace tên đúng "Hustly Team" — coi đây là hồ sơ agency chính (các workspace theo tháng).\n')
        ws = await prisma.workspace.findMany({
            where: { profileId: '61f25775-eb95-4ece-96e8-99ae97542af1' },
            select: { id: true, name: true, profileId: true },
        })
    }
    console.log(`Workspace trong hồ sơ này:`)
    for (const w of ws) console.log(`  "${w.name}"  profileId=${w.profileId}`)

    const profileIds = [...new Set(ws.map((w) => w.profileId).filter((p): p is string => !!p))]
    if (profileIds.length === 0) {
        console.log('\nWorkspace này không có profileId — không tra được client theo hồ sơ.\n')
        return
    }

    const candidates = await prisma.client.findMany({
        where: {
            profileId: { in: profileIds },
            name: { contains: 'Archie', mode: 'insensitive' },
            status: { not: 'MERGED' },
        },
        select: { id: true, name: true, parentId: true, tier: true, status: true },
    })

    if (candidates.length === 0) {
        console.log('\nKhông tìm thấy client nào tên chứa "Archie" trong hồ sơ này. Client tên gần giống:\n')
        const near = await prisma.client.findMany({
            where: { profileId: { in: profileIds }, status: { not: 'MERGED' } },
            select: { name: true },
            take: 60,
        })
        console.log(near.map((c) => c.name).sort().join(', '))
        return
    }

    console.log(`\nKhách khớp "Archie": ${candidates.map((c) => `${c.name} (id=${c.id})`).join(', ')}\n`)

    for (const client of candidates) {
        // Cộng cả client con — thống nhất theo cách tính chuẩn: gộp sub-client vào root.
        const subs = await prisma.client.findMany({ where: { parentId: client.id }, select: { id: true, name: true } })
        const allIds = [client.id, ...subs.map((s) => s.id)]
        if (subs.length) console.log(`  (gộp cả ${subs.length} client con: ${subs.map((s) => s.name).join(', ')})`)

        const tasks = await prisma.task.findMany({
            where: { clientId: { in: allIds } },
            orderBy: { createdAt: 'asc' },
            select: {
                title: true, status: true, type: true, value: true, jobPriceUSD: true,
                createdAt: true, deadline: true, isArchived: true, invoiceStatus: true,
            },
        })

        console.log(`\n━━━ ${client.name} — ${tasks.length} video/task ━━━\n`)
        if (tasks.length === 0) {
            console.log('  (chưa có task nào)')
            continue
        }

        let totalValue = 0
        let totalUsd = 0
        for (const t of tasks) {
            totalValue += Number(t.value ?? 0)
            totalUsd += Number(t.jobPriceUSD ?? 0)
            const date = t.createdAt.toISOString().slice(0, 10)
            console.log(
                `  ${date}  [${t.status.padEnd(16)}] ${t.type.padEnd(10)} ${vnd(t.value).padStart(14)}  ${usd(t.jobPriceUSD).padStart(9)}  ${t.title}`,
            )
        }
        console.log(`\n  TỔNG: ${vnd(totalValue)}` + (totalUsd > 0 ? `  ·  ${usd(totalUsd)}` : ''))
    }
    console.log('')
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
