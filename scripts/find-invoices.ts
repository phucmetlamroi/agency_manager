/**
 * [Tra cứu] Hoá đơn đã có của một khách — chỉ đọc.
 *
 * Dùng TRƯỚC khi tạo hoá đơn mới. Task mang invoiceStatus = 'INVOICED' nghĩa là
 * nó ĐÃ nằm trên một hoá đơn nào đó; tạo thêm hoá đơn nữa cho cùng task là tính
 * tiền khách hai lần.
 *
 * Bối cảnh: trên VPS, createInvoiceRecord chạy TRƯỚC rồi mới gọi /api/invoices/
 * generate. Bước tạo PDF từng chết vì Chrome (lỗi crashpad, đã sửa ở cfef579) —
 * khi đó hoá đơn ĐÃ được ghi vào cơ sở dữ liệu và task ĐÃ bị đánh dấu INVOICED,
 * chỉ thiếu mỗi tệp PDF. Đúng cái bẫy script này để phát hiện.
 *
 * Chạy: npx tsx scripts/ent/find-invoices.ts "<tên khách>"
 */
import { prisma } from '../../src/lib/db'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

async function main() {
    const q = process.argv[2]
    if (!q) {
        console.error('Dùng: npx tsx scripts/ent/find-invoices.ts "<tên khách>"')
        process.exit(1)
    }

    const clients = await prisma.client.findMany({
        where: { profileId: PROFILE_ID, name: { contains: q, mode: 'insensitive' }, status: { not: 'MERGED' } },
        select: { id: true, name: true },
    })
    if (clients.length === 0) return console.log(`\nKhông tìm thấy khách "${q}".\n`)

    for (const c of clients) {
        const invoices = await prisma.invoice.findMany({
            where: { clientId: c.id },
            orderBy: { issueDate: 'desc' },
            select: {
                id: true, invoiceNumber: true, status: true, issueDate: true,
                subtotalAmount: true, totalDue: true, filePath: true, fileCreatedAt: true,
                workspaceId: true,
                items: { select: { description: true, amount: true } },
                tasks: { select: { title: true, invoiceStatus: true } },
            },
        })

        console.log(`\n━━━ ${c.name} (id=${c.id}) — ${invoices.length} hoá đơn ━━━`)
        if (invoices.length === 0) {
            console.log('    (chưa có hoá đơn nào)')
            continue
        }

        for (const inv of invoices) {
            const ws = inv.workspaceId
                ? (await prisma.workspace.findUnique({ where: { id: inv.workspaceId }, select: { name: true } }))?.name
                : null
            console.log(`\n  ▸ ${inv.invoiceNumber}   ${inv.status}   ${inv.issueDate.toISOString().slice(0, 10)}   ${ws ?? ''}`)
            console.log(`    Tổng phải trả : $${Number(inv.totalDue).toFixed(2)}`)
            console.log(`    Tệp PDF       : ${inv.filePath ? `có (${inv.fileCreatedAt?.toISOString().slice(0, 16)})` : '❌ CHƯA CÓ — hoá đơn đã lưu nhưng PDF chưa tạo được'}`)
            for (const it of inv.items) console.log(`      · ${it.description.slice(0, 50).padEnd(50)} $${Number(it.amount).toFixed(2)}`)
            if (inv.tasks.length) {
                console.log(`    Task gắn vào  :`)
                for (const t of inv.tasks) console.log(`      · [${t.invoiceStatus}] ${t.title.slice(0, 50)}`)
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
