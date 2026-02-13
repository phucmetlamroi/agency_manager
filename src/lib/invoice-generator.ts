import chromium from '@sparticuz/chromium-min'
import puppeteer from 'puppeteer-core'
import handlebars from 'handlebars'

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
        .invoice-title { font-size: 40px; font-weight: bold; color: #333; text-transform: uppercase; margin: 0; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
        .meta-box h3 { font-size: 12px; text-transform: uppercase; color: #888; margin-bottom: 5px; }
        .meta-box p { margin: 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; }
        
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { text-align: left; padding: 10px; border-bottom: 2px solid #eee; font-size: 12px; text-transform: uppercase; color: #888; }
        td { padding: 15px 10px; border-bottom: 1px solid #eee; font-size: 14px; }
        .col-desc { width: 50%; }
        .col-qty, .col-rate, .col-amt { text-align: right; }
        
        .totals { float: right; width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .total-row.final { font-weight: bold; font-size: 18px; border-top: 2px solid #333; margin-top: 10px; padding-top: 10px; }
        
        .footer { clear: both; margin-top: 80px; padding-top: 30px; border-top: 1px solid #eee; font-size: 12px; color: #888; }
        .bank-info { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-top: 40px; }
        .bank-info h3 { margin-top: 0; font-size: 14px; }
        
        .status-badge { 
            position: fixed; top: 30px; right: 30px; 
            padding: 10px 20px; border: 4px solid #cc0000; 
            color: #cc0000; font-weight: bold; text-transform: uppercase; 
            transform: rotate(-15deg); opacity: 0.3; font-size: 30px;
        }
    </style>
</head>
<body>
    {{#if isVoid}}
    <div class="status-badge">VOID</div>
    {{/if}}

    <div class="header">
        <div class="logo">{{agencyName}}</div>
        <div>
            <h1 class="invoice-title">Invoice</h1>
            <p style="text-align: right; color: #666;">#{{invoiceNumber}}</p>
        </div>
    </div>

    <div class="meta-grid">
        <div class="meta-box">
            <h3>Bill To</h3>
            <p><strong>{{clientName}}</strong></p>
            <p>{{clientAddress}}</p>
        </div>
        <div class="meta-box" style="text-align: right;">
            <div style="margin-bottom: 15px;">
                <h3>Date</h3>
                <p>{{issueDate}}</p>
            </div>
            <div>
                <h3>Due Date</h3>
                <p>{{dueDate}}</p>
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
                    {{#if note}}<div style="font-size: 11px; color: #888; margin-top: 2px;">{{note}}</div>{{/if}}
                </td>
                <td class="col-qty">{{quantity}}</td>
                <td class="col-rate">{{unitPrice}}</td>
                <td class="col-amt">{{amount}}</td>
            </tr>
            {{/each}}
        </tbody>
    </table>

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

    <div class="bank-info">
        <h3>Payment Information</h3>
        <p><strong>Beneficiary:</strong> {{bank.beneficiaryName}}</p>
        <p><strong>Bank:</strong> {{bank.bankName}}</p>
        <p><strong>Account No:</strong> {{bank.accountNumber}}</p>
        {{#if bank.swiftCode}}<p><strong>SWIFT/BIC:</strong> {{bank.swiftCode}}</p>{{/if}}
        {{#if bank.address}}<p><strong>Bank Address:</strong> {{bank.address}}</p>{{/if}}
    </div>

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
    clientName: string
    clientAddress?: string
    issueDate: string
    dueDate: string
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
    bank: {
        beneficiaryName: string
        bankName: string
        accountNumber: string
        swiftCode?: string
        address?: string
    }
    isVoid?: boolean
}

export async function generateInvoicePDF(data: InvoiceData): Promise<Buffer> {
    let browser

    try {
        const compiled = handlebars.compile(INVOICE_TEMPLATE)
        const html = compiled(data)

        // Configure Puppeteer for Vercel vs Local
        const isProduction = process.env.NODE_ENV === 'production'

        if (isProduction) {
            browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: { width: 1920, height: 1080 },
                executablePath: await chromium.executablePath(),
                headless: (chromium as any).headless,
                ignoreHTTPSErrors: true,
            } as any)
        } else {
            // Local development fallback (requires local Chrome/Chromium installed)
            // Using puppeteer-core, checking common paths or assuming user has Chrome
            // Actually, for local dev, 'puppeteer' (full) is better, but to keep package small we rely on core.
            // We can point to a standard Chrome install if available.
            // Or we just expect the user to have CHROME_PATH env var manually set if needed.
            // Attempting to launch with default (might fail if no Chrome found in path).

            // Strategy: Look for Chrome
            const localExecutablePath =
                process.platform === 'win32'
                    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                    : process.platform === 'linux'
                        ? '/usr/bin/google-chrome'
                        : '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                executablePath: localExecutablePath,
                headless: true
            })
        }

        const page = await browser.newPage()
        await page.setContent(html, { waitUntil: 'networkidle0' })

        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        })

        return Buffer.from(pdf)

    } catch (error) {
        console.error('PDF Generation Error:', error)
        throw new Error('Failed to generate PDF')
    } finally {
        if (browser) await browser.close()
    }
}
