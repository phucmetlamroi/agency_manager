/**
 * [Tra cứu] Xuất hóa đơn cho một client trong hồ sơ Hustly Team — dùng ĐÚNG hàm
 * render PDF của hệ thống (`generateInvoicePDF` trong src/lib/invoice-generator.ts,
 * cùng khuôn Handlebars mà route /api/invoices/generate dùng thật), với dữ liệu
 * kéo trực tiếp từ cơ sở dữ liệu — không tự bịa số.
 *
 * CHỦ Ý KHÔNG ghi vào bảng Invoice: việc đó có hậu quả thật trên hệ thống đang
 * chạy (đánh dấu task đã xuất hóa đơn, trừ tiền cọc, cấp một invoiceNumber phải
 * không trùng với hàng thật). Đây chỉ là tệp PDF để xem/gửi/in; đăng ký chính
 * thức vào hệ thống thì làm qua giao diện thật (nút "Xuất & Lưu" trong InvoiceModal).
 *
 * Chạy: npx tsx scripts/ent/render-invoice.ts "<tên client>" "<đường dẫn ra>" ["<lọc tên task>"]
 *   - Không truyền lọc tên task ⇒ lấy TẤT CẢ task của client đó.
 *   - Có lọc ⇒ chỉ lấy task có title chứa chuỗi đó (không phân biệt hoa/thường).
 */
import { prisma } from '../../src/lib/db'
import { generateInvoicePDF, type InvoiceData } from '../../src/lib/invoice-generator'
import { TASK_STATUS_META } from '../../src/lib/task-statuses'
import fs from 'fs'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'

/** Dịch trạng thái sang tiếng Anh bằng ĐÚNG bảng khách-nhìn thấy của hệ thống
 *  (TASK_STATUS_META.clientLabel — cùng bảng dùng cho email/portal khách). */
function clientLabel(status: string): string {
    return TASK_STATUS_META.find((m) => m.value === status)?.clientLabel ?? status
}

async function main() {
    const clientName = process.argv[2]
    const out = process.argv[3]
    const titleFilter = process.argv[4]
    if (!clientName || !out) {
        console.error('Dùng: npx tsx scripts/ent/render-invoice.ts "<tên client>" "<đường dẫn ra>" ["<lọc tên task>"]')
        process.exit(1)
    }

    const client = await prisma.client.findFirst({
        where: { profileId: PROFILE_ID, name: { equals: clientName, mode: 'insensitive' }, status: { not: 'MERGED' } },
        select: { id: true, name: true },
    })
    if (!client) throw new Error(`Không tìm thấy client "${clientName}" trong hồ sơ Hustly Team.`)

    const tasks = await prisma.task.findMany({
        where: {
            clientId: client.id,
            ...(titleFilter ? { title: { contains: titleFilter, mode: 'insensitive' } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        select: { title: true, status: true, type: true, jobPriceUSD: true, createdAt: true, productLink: true },
    })
    if (tasks.length === 0) throw new Error(`Client "${client.name}" không có task nào khớp bộ lọc.`)

    const profile = await prisma.profile.findUnique({ where: { id: PROFILE_ID }, select: { name: true } })
    const billing = await prisma.billingProfile.findFirst({ where: { profileId: PROFILE_ID }, orderBy: { isDefault: 'desc' } })

    // Mã hóa đơn theo đúng khuôn hệ thống (INV-{năm}-{3 số}), tránh trùng mã
    // đã tồn tại thật trong bảng Invoice.
    const used = new Set((await prisma.invoice.findMany({ select: { invoiceNumber: true } })).map((i) => i.invoiceNumber))
    let invoiceNumber = ''
    do {
        invoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    } while (used.has(invoiceNumber))

    const currency = billing?.currency || '$'
    const items = tasks.map((t) => {
        const amount = Number(t.jobPriceUSD ?? 0)
        const date = t.createdAt.toLocaleDateString('en-GB') // dd/mm/yyyy
        return {
            description: t.title,
            note: `${t.type} · ${date} · ${clientLabel(t.status)}${t.productLink ? ` · Ref: ${t.productLink}` : ''}`,
            quantity: 1,
            unitPrice: `${currency}${amount.toFixed(2)}`,
            amount: `${currency}${amount.toFixed(2)}`,
        }
    })
    const subtotal = tasks.reduce((s, t) => s + Number(t.jobPriceUSD ?? 0), 0)

    const data: InvoiceData = {
        invoiceNumber,
        agencyName: profile?.name || 'Hustly Team',
        customTitle: 'INVOICE',
        clientName: client.name,
        clientAddress: '',
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: 'Upon receipt',
        dueDateLabel: 'Due Date',
        items,
        subtotal: `${currency}${subtotal.toFixed(2)}`,
        totalDue: `${currency}${subtotal.toFixed(2)}`,
        bank: {
            beneficiaryName: billing?.beneficiaryName || '',
            bankName: billing?.bankName || '',
            accountNumber: billing?.accountNumber || '',
            swiftCode: billing?.swiftCode || undefined,
            address: billing?.address || undefined,
            notes: billing?.notes || undefined,
        },
    }

    console.log(`\nMã hóa đơn: ${invoiceNumber}`)
    console.log(`Khách: ${client.name}  ·  ${tasks.length} task:`)
    for (const t of tasks) console.log(`   - ${t.title}  (${currency}${Number(t.jobPriceUSD ?? 0).toFixed(2)})`)
    console.log(`Tổng: ${currency}${subtotal.toFixed(2)}\n`)

    const pdf = await generateInvoicePDF(data)
    fs.writeFileSync(out, pdf)
    console.log(`Đã ghi: ${out} (${(pdf.length / 1024).toFixed(0)} KB)\n`)
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
