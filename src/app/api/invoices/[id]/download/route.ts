import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF, InvoiceData } from '@/lib/invoice-generator'
import { getCurrentUser } from '@/lib/auth-guard'
import { getWorkspacePrisma } from '@/lib/prisma-workspace'

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const workspaceId = req.nextUrl.searchParams.get('workspaceId')
        
        if (!workspaceId) return new NextResponse('Workspace ID required', { status: 400 })

        // 1. Auth Check
        const user = await getCurrentUser()
        if (!user || (user.role !== 'ADMIN' && !user.isTreasurer)) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const workspacePrisma = getWorkspacePrisma(workspaceId)

        // 2. Fetch Invoice Data
        const invoice = await workspacePrisma.invoice.findUnique({
            where: { id },
            include: {
                items: true,
                client: true
            }
        })

        if (!invoice) return new NextResponse('Invoice not found', { status: 404 })

        const profile = invoice.billingSnapshot as any

        // 3. Construct PDF Payload
        const pdfPayload: InvoiceData = {
            invoiceNumber: invoice.invoiceNumber,
            agencyName: (invoice.billingSnapshot as any).agencyName || 'Agency Manager',
            clientName: invoice.client.name,
            clientAddress: (invoice as any).clientAddress || '',
            issueDate: invoice.issueDate.toLocaleDateString(),
            dueDate: invoice.dueDate ? invoice.dueDate.toLocaleDateString() : 'On Receipt',
            subtotal: invoice.subtotalAmount.toString(),
            taxPercent: Number(invoice.taxPercent),
            taxAmount: invoice.taxAmount.toString(),
            depositDeducted: Number(invoice.depositDeducted) > 0 ? invoice.depositDeducted.toString() : undefined,
            totalDue: invoice.totalDue.toString(),
            items: (invoice.items || []).map(i => ({
                description: i.description,
                quantity: i.quantity,
                unitPrice: i.unitPrice.toString(),
                amount: i.amount.toString()
            })),
            bank: {
                beneficiaryName: profile.beneficiaryName,
                bankName: profile.bankName,
                accountNumber: profile.accountNumber,
                swiftCode: profile.swiftCode,
                address: profile.address,
                notes: profile.notes
            }
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
