/**
 * [Tra cứu] Xuất hóa đơn cho khách "Archie" (hồ sơ Hustly Team) — dùng ĐÚNG
 * hàm render PDF của hệ thống (`generateInvoicePDF` trong src/lib/invoice-generator.ts,
 * cùng khuôn Handlebars mà route /api/invoices/generate dùng thật), với dữ liệu
 * kéo trực tiếp từ cơ sở dữ liệu.
 *
 * CHỦ Ý KHÔNG ghi vào bảng Invoice: việc đó có hậu quả thật trên hệ thống đang
 * chạy (đánh dấu task đã xuất hóa đơn, trừ tiền cọc, cấp một invoiceNumber phải
 * không trùng với hàng thật) — vượt quá một câu yêu cầu "tạo hóa đơn cho tôi
 * xem". Đây chỉ là tệp PDF, đúng định dạng, để xem/gửi/in; đăng ký chính thức
 * vào hệ thống thì làm qua giao diện thật (nút "Xuất & Lưu" trong InvoiceModal).
 *
 * Chạy: npx tsx scripts/ent/render-archie-invoice.ts
 */
import { prisma } from '../../src/lib/db'
import { generateInvoicePDF, type InvoiceData } from '../../src/lib/invoice-generator'
import { TASK_STATUS_META } from '../../src/lib/task-statuses'
import fs from 'fs'

const PROFILE_ID = '61f25775-eb95-4ece-96e8-99ae97542af1'
const CLIENT_ID = 196

/**
 * Dịch trạng thái sang tiếng Anh bằng ĐÚNG bảng khách-nhìn thấy của hệ thống
 * (TASK_STATUS_META.clientLabel — cùng bảng dùng cho email/portal khách), chứ
 * không tự đặt chữ. Đây cũng là lý do "Đã nộp video (nội bộ)" ở lần render
 * trước lọt nguyên tiếng Việt vào hóa đơn: STATUS_NOTE cũ chỉ dịch mỗi
 * 'Hoàn tất', mọi trạng thái khác đi qua thẳng không đổi.
 */
function clientLabel(status: string): string {
    return TASK_STATUS_META.find((m) => m.value === status)?.clientLabel ?? status
}

async function main() {
    const profile = await prisma.profile.findUnique({ where: { id: PROFILE_ID }, select: { name: true } })
    const billing = await prisma.billingProfile.findFirst({
        where: { profileId: PROFILE_ID },
        orderBy: { isDefault: 'desc' },
    })
    const client = await prisma.client.findUnique({ where: { id: CLIENT_ID }, select: { name: true } })
    const tasks = await prisma.task.findMany({
        where: { clientId: CLIENT_ID },
        orderBy: { createdAt: 'asc' },
        select: { title: true, status: true, type: true, jobPriceUSD: true, createdAt: true, productLink: true },
    })
    if (!client || tasks.length === 0) throw new Error('Không tìm thấy client hoặc task.')

    // Mã hóa đơn theo đúng khuôn hệ thống (INV-{năm}-{3 số}), tránh trùng những
    // mã đã tồn tại thật trong bảng Invoice — kể cả không ghi vào DB, mã trùng
    // với một hóa đơn thật sẽ gây nhầm lẫn nếu đặt cạnh nhau.
    const used = new Set((await prisma.invoice.findMany({ select: { invoiceNumber: true } })).map((i) => i.invoiceNumber))
    let invoiceNumber = ''
    do {
        invoiceNumber = `INV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`
    } while (used.has(invoiceNumber))

    const currency = billing?.currency || '$'
    const items = tasks.map((t) => {
        const amount = Number(t.jobPriceUSD ?? 0)
        const date = t.createdAt.toLocaleDateString('en-GB') // dd/mm/yyyy — khớp cách hệ thống hiện ngày cho client
        const statusNote = clientLabel(t.status)
        return {
            description: t.title,
            note: `${t.type} · ${date} · ${statusNote}${t.productLink ? ` · Ref: ${t.productLink}` : ''}`,
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
    console.log(`Khách: ${client.name}  ·  ${tasks.length} video  ·  Tổng: ${currency}${subtotal.toFixed(2)}\n`)

    const pdf = await generateInvoicePDF(data)
    const out = process.argv[2] || 'invoice-archie.pdf'
    fs.writeFileSync(out, pdf)
    console.log(`Đã ghi: ${out} (${(pdf.length / 1024).toFixed(0)} KB)\n`)
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
