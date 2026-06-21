import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF, InvoiceData } from '@/lib/invoice-generator'
import { verifyFinanceAccess } from '@/lib/security'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { workspaceId, ...data } = (body ?? {}) as InvoiceData & { workspaceId?: string }

        // [AUDIT R14 — fix] Was gated on the GLOBAL User.role==='ADMIN' / isTreasurer flags
        // with no workspace scope (the pre-R8 pattern). Require profile-scoped finance
        // authority in the claimed workspace, matching the invoice download route. (The PDF
        // is rendered from caller-supplied body data, so this is a consistency/hardening gate
        // rather than a stored-data leak.)
        if (!workspaceId) return new NextResponse('Workspace ID required', { status: 400 })
        try {
            await verifyFinanceAccess(workspaceId)
        } catch (e: any) {
            if (e?.message?.startsWith('SECURITY_VIOLATION')) return new NextResponse('Forbidden', { status: 403 })
            throw e
        }

        // Validate basic fields
        if (!data.invoiceNumber || !data.items || !data.totalDue) {
            return new NextResponse('Missing required fields', { status: 400 })
        }

        // Generate PDF
        const pdfBuffer = await generateInvoicePDF(data)

        // Stream Response
        return new NextResponse(pdfBuffer as any, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Invoice-${data.invoiceNumber}.pdf"`,
                'Content-Length': pdfBuffer.length.toString(),
            },
        })

    } catch (error: any) {
        console.error('Invoice Generation API Error:', error)
        return new NextResponse(`PDF Generation Failed: ${error.message || 'Unknown Error'}`, { status: 500 })
    }
}
