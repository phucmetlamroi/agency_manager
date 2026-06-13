import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

function findChrome() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    ]
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return p
    }
    throw new Error('No Chrome')
}

const HTML = process.argv[2]
const OUTDIR = process.argv[3]
const html = fs.readFileSync(HTML, 'utf8')
fs.mkdirSync(OUTDIR, { recursive: true })

const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
// A4 at 96dpi ≈ 794x1123 px
await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 })
await page.setContent(html, { waitUntil: 'load' })

// Locate each .page element by index, screenshot
const pageHandles = await page.$$('.page')
console.log(`found ${pageHandles.length} pages`)
for (let i = 0; i < pageHandles.length; i++) {
    const out = path.join(OUTDIR, `page-${i + 1}.png`)
    await pageHandles[i].screenshot({ path: out })
    console.log(`  ${out}`)
}
await browser.close()
console.log('done')
