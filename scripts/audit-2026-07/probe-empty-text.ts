/** Capture the EXACT wording of the empty-result state and the offline message. Read-only. */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

async function main() {
    const OUT = process.env.AUDIT_OUT_DIR!
    const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
    const b = await chromium.launch()
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    await ctx.addCookies([
        { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    const p = await ctx.newPage()

    await p.goto(`http://localhost:3000/${s.workspaceId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3500)

    // The task list lives in a <table>; read only that region so the sidebar text does not drown it.
    const readList = async () => await p.evaluate(() => {
        const t = document.querySelector('table')
        if (!t) return '(không thấy bảng)'
        return (t.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 220)
    })
    console.log('TRƯỚC khi tìm :', await readList())

    const search = p.locator('input[placeholder*="Tìm"]').first()
    await search.fill('zzzz-khong-bao-gio-co-ket-qua-zzzz')
    await p.waitForTimeout(2500)
    console.log('SAU khi tìm   :', await readList())
    await p.screenshot({ path: join(OUT, 'shots', 'VERIFY-empty-search.png') })

    // Offline: capture whatever new text appears (toast / banner).
    await p.goto(`http://localhost:3000/${s.workspaceId}/team`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(3500)
    const beforeTxt = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    await ctx.setOffline(true)
    const btn = p.locator('button').filter({ hasText: /Sắp xếp|Giao diện|Làm mới/ }).first()
    if (await btn.count()) await btn.click({ timeout: 5000 }).catch(() => {})
    await p.waitForTimeout(4500)
    const afterTxt = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    await p.screenshot({ path: join(OUT, 'shots', 'VERIFY-offline.png') })
    await ctx.setOffline(false)

    // What is genuinely NEW on screen after the outage.
    const added = afterTxt.split(' ').filter((w) => !beforeTxt.includes(w)).join(' ').slice(0, 300)
    console.log('\nCHỮ MỚI XUẤT HIỆN khi mất mạng:', added || '(không có chữ nào mới)')

    await b.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
