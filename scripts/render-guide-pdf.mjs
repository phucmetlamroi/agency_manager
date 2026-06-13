// Render client portal guide HTML → PDF via puppeteer-core + system Chrome
// Usage: node render-guide-pdf.mjs <input.html> <output.pdf>

import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const HTML = process.argv[2]
const OUT  = process.argv[3]
if (!HTML || !OUT) {
    console.error('usage: node render-guide-pdf.mjs <input.html> <output.pdf>')
    process.exit(1)
}

// Find Chrome on Windows (mirroring src/lib/invoice-generator.ts)
function findChrome() {
    const platform = process.platform
    if (platform === 'win32') {
        const candidates = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
        ]
        for (const p of candidates) {
            if (p && fs.existsSync(p)) return p
        }
        throw new Error('No Chrome/Edge found on Windows')
    }
    if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    return '/usr/bin/google-chrome'
}

const html = fs.readFileSync(HTML, 'utf8')

let browser
try {
    browser = await puppeteer.launch({
        executablePath: findChrome(),
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--font-render-hinting=none'],
    })
    const page = await browser.newPage()
    // High DPI for crisper rendering on screen too
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load' })
    // Make sure web fonts (if any) settle
    await page.evaluate(() => document.fonts && document.fonts.ready)

    const buf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })

    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, buf)
    console.log(`OK → ${OUT}  (${buf.length.toLocaleString()} bytes)`)
} catch (err) {
    console.error('FAIL:', err.message || err)
    process.exit(2)
} finally {
    if (browser) await browser.close()
}
