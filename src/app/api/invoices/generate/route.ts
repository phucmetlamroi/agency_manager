import { NextRequest, NextResponse } from 'next/server'
import { generateInvoicePDF, InvoiceData } from '@/lib/invoice-generator'
import { getCurrentUser } from '@/lib/auth-guard'

export async function POST(req: NextRequest) {
    try {
        // Security Check
        const user = await getCurrentUser()
        if (!user || user.role !== 'ADMIN') { // Treasurer check needed? Assuming Admin for now
            if (!user?.isTreasurer) return new NextResponse('Unauthorized', { status: 401 })
        }

        const body = await req.json()
        const data: InvoiceData = body

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
