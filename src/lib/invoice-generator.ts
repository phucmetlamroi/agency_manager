import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import handlebars from 'handlebars'
import fs from 'fs'

// Invoice Template (Inline for now, can move to file later)
const INVOICE_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Invoice {{invoiceNumber}}</title>
    <style>
        body { font-family: 'Helvetica', 'Arial', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 40px; }
        .logo { font-size: 24px; font-weight: bold; color: #000; }
        .invoice-title { font-size: 40px; font-weight: bold; color: #333; margin: 0; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .meta-box h3 { font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 5px; }
        .meta-box p { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 0; } /* Removed margin-bottom */
        th { text-align: left; padding: 10px; border-bottom: 2px solid #eee; font-size: 10px; text-transform: uppercase; color: #888; }
        td { padding: 15px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
        .col-desc { width: 50%; }
        .col-qty, .col-rate, .col-amt { text-align: right; }
        
        /* Fixed Gap Logic */
        .totals-container { display: flex; justify-content: flex-end; margin-top: 0; }
        .totals { width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; color: #666; font-size: 14px; }
        .total-row.final { font-weight: bold; font-size: 18px; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; color: #000; }
        
        .footer { clear: both; margin-top: 60px; padding-top: 30px; border-top: 1px solid #eee; font-size: 12px; color: #888; }
        .bank-info { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 40px; }
        .bank-info h3 { margin-top: 0; font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 10px; }
        
        .status-badge { 
            position: fixed; top: 30px; right: 30px; 
            padding: 10px 20px; border: 4px solid #cc0000; 
            color: #cc0000; font-weight: bold; text-transform: uppercase; 
            transform: rotate(-15deg); opacity: 0.3; font-size: 30px;
        }

        .payment-link {
            display: inline-block;
            margin-top: 15px;
            padding: 10px 15px;
            background-color: #f0fdf4;
            color: #16a34a;
            border: 1px solid #bbf7d0;
            border-radius: 6px;
            text-decoration: none;
            font-weight: bold;
            font-size: 13px;
        }
    </style>
</head>
<body>
    {{#if isVoid}}
    <div class="status-badge">VOID</div>
    {{/if}}

    <div class="header">
        <div class="logo">{{agencyName}}</div>
        <div style="text-align: right;">
            <h1 class="invoice-title">{{#if customTitle}}{{customTitle}}{{else}}INVOICE{{/if}}</h1>
            <p style="text-align: right; color: #666; margin-top: 5px;"># {{invoiceNumber}}</p>
        </div>
    </div>

    <div class="meta-grid">
        <div class="meta-box">
            <h3>Bill To</h3>
            <p><strong>{{clientName}}</strong></p>
            <p>{{clientAddress}}</p>
        </div>
        <div class="meta-box" style="text-align: right;">
            <div style="margin-bottom: 15px; display: flex; justify-content: flex-end; gap: 20px;">
                <h3 style="margin: 0; padding-top: 2px;">Date</h3>
                <p style="width: 120px; text-align: right; font-weight: 500;">{{issueDate}}</p>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 20px; background: #f9f9f9; padding: 8px 12px; border-radius: 6px; display: inline-flex;">
                <h3 style="margin: 0; padding-top: 2px;">{{dueDateLabel}}</h3>
                <p style="width: 120px; text-align: right; font-weight: bold;">{{dueDate}}</p>
            </div>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th class="col-desc">Description</th>
                <th class="col-qty">QTY</th>
                <th class="col-rate">RATE</th>
                <th class="col-amt">AMOUNT</th>
            </tr>
        </thead>
        <tbody>
            {{#each items}}
            <tr>
                <td>
                    <div style="font-weight: bold;">{{description}}</div>
                    {{#if note}}<div style="font-size: 11px; color: #888; margin-top: 4px;">{{note}}</div>{{/if}}
                </td>
                <td class="col-qty">{{quantity}}</td>
                <td class="col-rate">{{unitPrice}}</td>
                <td class="col-amt">{{amount}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>

    <div class="totals-container">
        <div class="totals">
            <div class="total-row">
                <span>Subtotal</span>
                <span>{{subtotal}}</span>
            </div>
            {{#if taxAmount}}
            <div class="total-row">
                <span>Tax ({{taxPercent}}%)</span>
                <span>{{taxAmount}}</span>
            </div>
            {{/if}}
            {{#if depositDeducted}}
            <div class="total-row" style="color: #cc0000;">
                <span>Less Deposit</span>
                <span>-{{depositDeducted}}</span>
            </div>
            {{/if}}
            <div class="total-row final">
                <span>Total Due</span>
                <span>{{totalDue}}</span>
            </div>
        </div>
    </div>

    <div class="bank-info">
        <h3>Payment Information</h3>
        <p><strong>Beneficiary:</strong> {{bank.beneficiaryName}}</p>
        <p><strong>Bank:</strong> {{bank.bankName}}</p>
        <p><strong>Account No:</strong> {{bank.accountNumber}}</p>
        {{#if bank.swiftCode}}<p><strong>SWIFT/BIC:</strong> {{bank.swiftCode}}</p>{{/if}}
        {{#if bank.address}}<p><strong>Bank Address:</strong> {{bank.address}}</p>{{/if}}
        {{#if paymentLink}}
        <div>
            <a href="{{paymentLink}}" target="_blank" class="payment-link">🔗 Click here for Payment Guide / Link</a>
        </div>
        {{/if}}
    </div>

    {{#if bank.notes}}
    <div style="margin-top: 20px; font-size: 12px; color: #666; white-space: pre-wrap;">
        <strong style="color: #888; text-transform: uppercase; font-size: 10px;">Notes</strong><br/>
        {{bank.notes}}
    </div>
    {{/if}}

    <div class="footer">
        <p>Thank you for your business!</p>
        <p>{{agencyName}}</p>
    </div>
</body>
</html>
`

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
    let browser

    try {
        const compiled = handlebars.compile(INVOICE_TEMPLATE)
        const html = compiled(data)

        // Configure Puppeteer for Vercel vs Local
        const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION

        if (isVercel) {
            // Optimized for Vercel Serverless
            const chromiumAny = chromium as any;
            
            // Set graphics mode to false for serverless environments
            chromiumAny.setGraphicsMode = false;
            
            browser = await puppeteer.launch({
                args: chromiumAny.args,
                defaultViewport: chromiumAny.defaultViewport,
                executablePath: await chromiumAny.executablePath(),
                headless: chromiumAny.headless,
            } as any)
        } else {
            // Local development or Local Production (Windows/Mac/Linux)
            const platform = process.platform

            let executablePath = ''
            if (platform === 'win32') {
                const paths = [
                    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
                    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
                    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                ]

                for (const p of paths) {
                    if (fs.existsSync(p)) {
                        executablePath = p
                        break
                    }
                }
            } else if (platform === 'linux') {
                executablePath = '/usr/bin/google-chrome'
            } else if (platform === 'darwin') {
                executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            }

            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
                executablePath: executablePath || undefined,
                headless: true
            })
        }

        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' }) // networkidle0 ensures all resources are loaded

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
            preferCSSPageSize: true
        })

        return Buffer.from(pdfBuffer)

    } catch (error: any) {
        console.error('PDF Generation Error Status:', error)
        throw new Error(`Failed to generate PDF: ${error.message || 'Unknown'}`)
    } finally {
        if (browser) await browser.close()
    }
}
