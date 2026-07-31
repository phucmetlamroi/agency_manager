/**
 * Adversarial check on my own measurements before any of them is reported.
 *
 *  A. Bảng lương returned 28 buttons at 1280px but 2 at 1281px and 1440px — non-monotonic, so it
 *     smells like a LOADING RACE, not a breakpoint. Re-measure after waiting for real content.
 *  B. The contrast pass resolves the background by walking up parents reading backgroundColor.
 *     This UI leans on GRADIENTS (background-image), which that walk cannot see — so a "1.04:1"
 *     may be my bug, not a real invisible label. Dump what is actually painted behind the worst
 *     offenders, plus a screenshot to look at.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
    const OUT = process.env.AUDIT_OUT_DIR!
    const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    await ctx.addCookies([
        { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    const page = await ctx.newPage()

    console.log('A. BẢNG LƯƠNG — đếm nút sau khi CHỜ nội dung thật, mỗi mốc đo 2 lần')
    for (const w of [1280, 1281, 1440, 1536]) {
        const counts: number[] = []
        for (let pass = 0; pass < 2; pass++) {
            await page.setViewportSize({ width: w, height: 900 })
            await page.goto(`http://localhost:3000/${s.workspaceId}/admin/payroll`, { waitUntil: 'domcontentloaded' })
            // Wait for the page to actually settle rather than a fixed 1.1s guess.
            await page.waitForFunction(() => {
                const n = Array.from(document.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0).length
                return n > 2
            }, undefined, { timeout: 20_000 }).catch(() => {})
            await page.waitForTimeout(2500)
            counts.push(await page.locator('button').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length))
        }
        console.log(`  ${String(w).padStart(5)}px → ${counts.join(' và ')} nút  ${counts[0] === counts[1] ? '(ổn định)' : '⚠ KHÔNG ỔN ĐỊNH — phép đo trước không tin được'}`)
    }

    console.log('\nB. TƯƠNG PHẢN — nền THẬT phía sau các nhãn bị chấm điểm thấp nhất')
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`http://localhost:3000/${s.workspaceId}/admin/payroll`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    const probe = await page.evaluate(() => {
        const want = ['Mở tài khoản', 'Hoàn tất', 'Dự kiến']
        const out: Record<string, string>[] = []
        for (const el of Array.from(document.querySelectorAll('button, a, span'))) {
            const t = ((el as HTMLElement).innerText || '').trim()
            if (!t || !want.some((w) => t.startsWith(w))) continue
            if (el.getBoundingClientRect().width === 0) continue
            const cs = getComputedStyle(el)
            // What my measurement pass saw:
            let walkBg = 'none'
            let n: Element | null = el
            while (n) { const b = getComputedStyle(n).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { walkBg = b; break } n = n.parentElement }
            // What is ACTUALLY painted: check for a gradient on the element or its ancestors.
            let gradient = 'none'
            n = el
            while (n) { const bi = getComputedStyle(n).backgroundImage; if (bi && bi !== 'none') { gradient = `${(n as HTMLElement).tagName}.${(n as HTMLElement).className?.toString().slice(0, 30)} → ${bi.slice(0, 60)}`; break } n = n.parentElement }
            out.push({ text: t.slice(0, 28), color: cs.color, ownBg: cs.backgroundColor, walkedBg: walkBg, gradient })
            if (out.length >= 6) break
        }
        return out
    })
    for (const p of probe) {
        console.log(`  "${p.text}"`)
        console.log(`      màu chữ      : ${p.color}`)
        console.log(`      nền của nó   : ${p.ownBg}`)
        console.log(`      nền tôi dò ra: ${p.walkedBg}`)
        console.log(`      có gradient? : ${p.gradient}`)
    }

    await page.screenshot({ path: join(OUT, 'shots', 'VERIFY-payroll-1440.png') })
    console.log(`\nẢnh để nhìn tận mắt: shots/VERIFY-payroll-1440.png`)
    await browser.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
