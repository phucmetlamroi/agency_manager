/**
 * [Xuất lại] Dựng PDF cho một hoá đơn ĐÃ CÓ trong hệ thống — chỉ đọc DB.
 *
 * VÌ SAO CẦN: trên VPS, luồng "Xuất & Lưu" chạy hai bước — ghi hoá đơn vào cơ sở
 * dữ liệu TRƯỚC, rồi mới gọi tạo PDF. Bước tạo PDF từng chết vì Chrome không có
 * $HOME ghi được (lỗi crashpad, đã sửa ở cfef579). Hậu quả: hoá đơn ĐÃ tồn tại,
 * task ĐÃ bị đánh dấu INVOICED, chỉ thiếu mỗi tệp PDF. Bấm "Xuất & Lưu" lại là
 * tạo hoá đơn TRÙNG chứ không sửa được gì.
 *
 * Script này lấy đúng hoá đơn đã có và dựng PDF từ ẢNH CHỤP ĐÔNG CỨNG lúc phát
 * hành (billingSnapshot + clientSnapshot) — sao chép nguyên logic của
 * src/app/api/invoices/[id]/download/route.ts, nên tệp ra khớp đúng thứ hệ thống
 * sẽ tự tạo khi anh bấm tải lại sau này.
 *
 * KHÔNG ghi gì vào cơ sở dữ liệu. Không tạo hoá đơn mới.
 *
 * Chạy: npx tsx scripts/ent/render-existing-invoice.ts INV-2026-273 <đường-dẫn-ra>
 */
import { prisma } from '../../src/lib/db'
import { generateInvoicePDF, type InvoiceData } from '../../src/lib/invoice-generator'
import fs from 'fs'

async function main() {
    const number = process.argv[2]
    const out = process.argv[3]
    if (!number || !out) {
        console.error('Dùng: npx tsx scripts/ent/render-existing-invoice.ts <mã hoá đơn> <đường dẫn ra>')
        process.exit(1)
    }

    const invoice = await prisma.invoice.findUnique({
        where: { invoiceNumber: number },
        include: { items: true, client: true },
    })
    if (!invoice) throw new Error(`Không tìm thấy hoá đơn ${number}.`)

    const profile = invoice.billingSnapshot as any
    const pres = (invoice.clientSnapshot ?? {}) as Record<string, any>
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
    const cur = str(pres.currency) || str(profile?.currency) || '$'
    // Định dạng thẳng từ Decimal của Prisma. Đi qua Number() trước sẽ làm 1.005
    // thành "1.00" (IEEE-754) trong khi Decimal.toFixed cho "1.01".
    const money = (v: { toFixed(n: number): string }) => `${cur}${v.toFixed(2)}`

    const data: InvoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        agencyName: str(pres.agencyName) || str(profile?.agencyName) || 'Agency Manager',
        customTitle: str(pres.customTitle),
        // Đông cứng lúc phát hành — khách đổi tên sau này không được dán nhãn lại hoá đơn cũ.
        clientName: str(pres.clientName) || invoice.client.name,
        clientAddress: str(pres.clientAddress) ?? '',
        dueDateLabel: str(pres.dueDateLabel),
        paymentLink: str(pres.paymentLink),
        issueDate: invoice.issueDate.toLocaleDateString('en-GB'),
        dueDate: invoice.dueDate ? invoice.dueDate.toLocaleDateString('en-GB') : 'On Receipt',
        subtotal: money(invoice.subtotalAmount),
        taxPercent: Number(invoice.taxPercent),
        taxAmount: Number(invoice.taxAmount) > 0 ? money(invoice.taxAmount) : undefined,
        depositDeducted: Number(invoice.depositDeducted) > 0 ? money(invoice.depositDeducted) : undefined,
        totalDue: money(invoice.totalDue),
        items: (invoice.items || []).map((i) => ({
            description: i.description,
            quantity: i.quantity,
            unitPrice: money(i.unitPrice),
            amount: money(i.amount),
        })),
        bank: {
            beneficiaryName: profile?.beneficiaryName ?? '',
            bankName: profile?.bankName ?? '',
            accountNumber: profile?.accountNumber ?? '',
            swiftCode: profile?.swiftCode,
            address: profile?.address,
            notes: profile?.notes,
        },
        // Hoá đơn đã huỷ phải đóng dấu VOID — không được đọc như còn phải trả.
        isVoid: invoice.status === 'VOID',
    }

    console.log(`\nHoá đơn : ${invoice.invoiceNumber}   (${invoice.status})`)
    console.log(`Khách   : ${data.clientName}`)
    console.log(`Tổng    : ${data.totalDue}`)
    if (data.isVoid) console.log('⚠️  Hoá đơn này ĐÃ HUỶ — PDF sẽ có dấu VOID.')

    const pdf = await generateInvoicePDF(data)
    fs.writeFileSync(out, pdf)
    console.log(`\nĐã ghi: ${out} (${(pdf.length / 1024).toFixed(0)} KB)\n`)
}

main()
    .catch((e) => {
        console.error(e instanceof Error ? e.message : e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
