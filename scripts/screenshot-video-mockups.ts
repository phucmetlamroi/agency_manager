/**
 * Render 7 HTML mockup files thành PNG (1920×1080) cho video brief.
 *
 * Output: public/video-assets/screens/*.png
 *
 * Cần Playwright (đã có via `npx playwright`).
 *
 * Run: npx tsx scripts/screenshot-video-mockups.ts
 */

import { chromium } from 'playwright'
import { join, resolve } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const MOCKUPS = [
    { in: '01-dashboard.html', out: '01-dashboard.png' },
    { in: '02-task-queue.html', out: '02-task-queue.png' },
    { in: '03-finance.html', out: '03-finance.png' },
    { in: '04-marketplace.html', out: '04-marketplace.png' },
    { in: '05-velox-scan.html', out: '05-velox-scan.png' },
    { in: '06-create-task.html', out: '06-create-task.png' },
    { in: '07-client-portal.html', out: '07-client-portal.png' },
]

async function main() {
    const root = process.cwd()
    const mockupDir = join(root, 'public', 'video-assets', 'mockups')
    const outDir = join(root, 'public', 'video-assets', 'screens')

    console.log('═'.repeat(70))
    console.log('Render mockup HTML → PNG (1920×1080)')
    console.log('═'.repeat(70))

    const browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1.5, // hi-DPI for crisp output
    })

    for (const { in: htmlFile, out: pngFile } of MOCKUPS) {
        const htmlPath = join(mockupDir, htmlFile)
        const outPath = join(outDir, pngFile)
        const url = pathToFileURL(htmlPath).href

        const page = await ctx.newPage()
        await page.goto(url, { waitUntil: 'networkidle' })
        // Đợi fonts Google load (Plus Jakarta Sans + Be Vietnam Pro)
        await page.waitForLoadState('networkidle')
        await page.waitForFunction(() => document.fonts.ready.then(() => true), { timeout: 15000 })
        await page.waitForTimeout(500) // Extra buffer cho render cuối

        await page.screenshot({ path: outPath, fullPage: false, type: 'png' })
        console.log(`✓ ${htmlFile.padEnd(28)} → ${pngFile}`)
        await page.close()
    }

    await browser.close()
    console.log('═'.repeat(70))
    console.log(`Done. ${MOCKUPS.length} PNG files saved to public/video-assets/screens/`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
