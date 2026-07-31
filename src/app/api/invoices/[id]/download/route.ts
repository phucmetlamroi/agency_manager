import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF, InvoiceData } from '@/lib/invoice-generator'
import { getWorkspacePrisma, resolveWorkspaceProfileId } from '@/lib/prisma-workspace'
import { verifyFinanceAccess } from '@/lib/security'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const workspaceId = req.nextUrl.searchParams.get('workspaceId')

        if (!workspaceId) return new NextResponse('Workspace ID required', { status: 400 })

        // 1+2. SECURITY: finance authorization + workspace scope. [AUDIT R7 — fix]
        // verifyFinanceAccess requires membership of THIS workspace's profile AND
        // profile-scoped finance authority (a treasurer who is a profile OWNER/ADMIN),
        // replacing the old GLOBAL isTreasurer flag that let a treasurer of another
        // tenant download this tenant's invoices.
        let financeUserId: string
        try {
            const access = await verifyFinanceAccess(workspaceId)
            financeUserId = access.userId
        } catch (e: any) {
            if (e?.message?.startsWith('SECURITY_VIOLATION')) {
                return new NextResponse('Forbidden', { status: 403 })
            }
            throw e
        }

        // [PHẢN BIỆN vòng 4 · INV-R1 — HIGH] ĐÂY LÀ SINK RÒ DỮ LIỆU của lỗ createInvoiceRecord.
        //
        // `getWorkspacePrisma(workspaceId)` KHÔNG truyền profileId, và `include: { client: true }`
        // là QUAN HỆ LỒNG — lớp chèn tenancy KHÔNG viết lại quan hệ lồng, còn chốt fail-closed của
        // `Client` chỉ bắn khi model Ở TẦNG TRÊN là Client (ở đây là Invoice). Nên hàng Client đi
        // kèm KHÔNG có bộ lọc tenant nào, và `invoice.client.name` được in thẳng vào PDF.
        // Kết hợp với việc `clientId` từng không được kiểm sở hữu lúc tạo hoá đơn, đó là đường dò
        // sạch danh bạ khách của MỌI tenant. Chốt sở hữu đã thêm ở invoice-actions đóng đường TẠO
        // MỚI; dòng này đóng đường ĐỌC, kể cả với hàng Invoice rác đã tồn tại từ trước.
        const scopedProfileId = (await resolveWorkspaceProfileId(workspaceId)) ?? undefined
        const workspacePrisma = getWorkspacePrisma(workspaceId, scopedProfileId)

        // 2. Fetch Invoice Data
        const invoice = await workspacePrisma.invoice.findUnique({
            where: { id },
            include: {
                items: true,
                client: true
            }
        })

        if (!invoice) return new NextResponse('Invoice not found', { status: 404 })

        // 3. DEFENSE-IN-DEPTH: explicit workspace scope check.
        // getWorkspacePrisma đã auto-inject workspaceId filter, nhưng nếu middleware
        // có bug → bypass. Check thêm tại đây để bullet-proof anti-IDOR.
        // Audit finding #6 (HIGH): Invoice download cross-workspace risk.
        if ((invoice as any).workspaceId && (invoice as any).workspaceId !== workspaceId) {
            console.error(`[IDOR] User ${financeUserId} attempted download invoice ${id} from workspace ${(invoice as any).workspaceId} via param ${workspaceId}`)
            return new NextResponse('Forbidden: Invoice does not belong to this workspace', { status: 403 })
        }

        const profile = invoice.billingSnapshot as any
        // [Invoice fidelity 2026-07] Presentation overrides frozen at issue time.
        // Before this, `clientAddress` read a column that does not exist (always ''),
        // the custom title / due-date label / payment link were lost entirely, and the
        // money strings went in bare — the template prints them verbatim, so a
        // re-downloaded PDF showed "1000" with no currency symbol. Null on invoices
        // issued earlier; the fallbacks below preserve the previous behaviour.
        const pres = (invoice.clientSnapshot ?? {}) as Record<string, any>
        const str = (v: unknown): string | undefined =>
            typeof v === 'string' && v.trim() ? v.trim() : undefined
        const cur = str(pres.currency) || str(profile?.currency) || '$'
        // Format straight off the Prisma Decimal. Routing through Number() first rounds
        // a stored 1.005 to "1.00" (IEEE-754) where Decimal.toFixed gives "1.01", and
        // silently loses digits on large values. Decimal and number both expose toFixed.
        const money = (v: { toFixed(n: number): string }) => `${cur}${v.toFixed(2)}`

        // 3. Construct PDF Payload
        const pdfPayload: InvoiceData = {
            invoiceNumber: invoice.invoiceNumber,
            agencyName: str(pres.agencyName) || str(profile?.agencyName) || 'Agency Manager',
            customTitle: str(pres.customTitle),
            // Frozen at issue time — a later client rename must not re-label this invoice.
            clientName: str(pres.clientName) || invoice.client.name,
            clientAddress: str(pres.clientAddress) ?? '',
            dueDateLabel: str(pres.dueDateLabel),
            paymentLink: str(pres.paymentLink),
            // [L18b] The invoice is client-facing for a UK client → en-GB (dd/mm/yyyy, stays English).
            // A bare toLocaleDateString() ran under the server's en-US locale → US mm/dd/yyyy.
            issueDate: invoice.issueDate.toLocaleDateString('en-GB'),
            dueDate: invoice.dueDate ? invoice.dueDate.toLocaleDateString('en-GB') : 'On Receipt',
            subtotal: money(invoice.subtotalAmount),
            taxPercent: Number(invoice.taxPercent),
            taxAmount: Number(invoice.taxAmount) > 0 ? money(invoice.taxAmount) : undefined,
            depositDeducted: Number(invoice.depositDeducted) > 0 ? money(invoice.depositDeducted) : undefined,
            totalDue: money(invoice.totalDue),
            items: (invoice.items || []).map(i => ({
                description: i.description,
                quantity: i.quantity,
                unitPrice: money(i.unitPrice),
                // Already the extended line total (unitPrice × quantity) — never re-multiply.
                amount: money(i.amount)
            })),
            bank: {
                beneficiaryName: profile.beneficiaryName,
                bankName: profile.bankName,
                accountNumber: profile.accountNumber,
                swiftCode: profile.swiftCode,
                address: profile.address,
                notes: profile.notes
            },
            // Stamp VOID across the page: a cancelled invoice must never read as
            // payable, whoever re-downloads it.
            isVoid: invoice.status === 'VOID',
        }

        // 4. Generate PDF
        const pdfBuffer = await generateInvoicePDF(pdfPayload)

        // 5. Respond
        return new NextResponse(pdfBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
                'Content-Length': pdfBuffer.length.toString(),
            },
        })

    } catch (error: any) {
        console.error('Download Invoice Error:', error)
        return new NextResponse(`Download Failed: ${error.message}`, { status: 500 })
    }
}
