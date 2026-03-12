import handlebars from 'handlebars'
import fs from 'fs'

// NOTE: Puppeteer and Chromium have been removed in Phase 1 to reduce bundle size and resource usage.
// If you need PDF generation back, you must reinstall @sparticuz/chromium and puppeteer-core.

// Invoice Template (Stubbed)
const INVOICE_TEMPLATE = `<div>PDF Generation Disabled</div>`

export type InvoiceData = {
    invoiceNumber: string
    agencyName: string
    customTitle?: string
    clientName: string
    clientAddress?: string
    issueDate: string
    dueDate: string
    dueDateLabel?: string
    items: {
        description: string
        note?: string
        quantity: number
        unitPrice: string
        amount: string // Formatted
    }[]
    subtotal: string
    taxPercent?: number // 0-100
    taxAmount?: string
    depositDeducted?: string
    totalDue: string
    paymentLink?: string
    bank: {
        beneficiaryName: string
        bankName: string
        accountNumber: string
        swiftCode?: string
        address?: string
        notes?: string
    }
    isVoid?: boolean
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
    console.error('PDF Generation is disabled because puppeteer-core was removed in Phase 1.');
    throw new Error('PDF Generation is disabled. Vui lòng cài lại thư viện puppeteer-core và @sparticuz/chromium nếu muốn sử dụng lại tính năng này.');
}
