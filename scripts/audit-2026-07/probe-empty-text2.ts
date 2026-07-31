/**
 * Corrected probe. Two mistakes in the previous pass are fixed here:
 *   1. The task list is not a <table>, so the empty-state text was never read. Search the whole
 *      DOM for the phrase instead of guessing the container.
 *   2. The offline test went offline while the page was STILL LOADING, so the folder listing
 *      arriving late was mistaken for an error message. Wait until the page is fully settled and
 *      snapshot it BEFORE cutting the network.
 */
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

    console.log('[1] TRẠNG THÁI RỖNG khi tìm không ra kết quả')
    await p.goto(`http://localhost:3000/${s.workspaceId}/dashboard`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(4000)
    const emptyPhrases = ['Chưa có task', 'Không có task', 'Không tìm thấy', 'trống', 'chưa có']
    const readEmpty = async () => await p.evaluate((phrases: string[]) => {
        const hits: string[] = []
        for (const el of Array.from(document.querySelectorAll('div, p, span, td'))) {
            const t = ((el as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
            if (!t || t.length > 120) continue
            if (phrases.some((ph) => t.toLowerCase().includes(ph.toLowerCase()))) hits.push(t)
        }
        return [...new Set(hits)].slice(0, 4)
    }, emptyPhrases)
    console.log('  trước khi tìm:', (await readEmpty()).join(' | ') || '(không có câu nào)')
    await p.locator('input[placeholder*="Tìm"]').first().fill('zzzz-khong-bao-gio-co-zzzz')
    await p.waitForTimeout(3000)
    const after = await readEmpty()
    console.log('  sau khi tìm  :', after.join(' | ') || '❌ (KHÔNG có câu giải thích nào)')

    console.log('\n[2] MẤT MẠNG — chờ trang tải XONG hẳn rồi mới ngắt kết nối')
    await p.goto(`http://localhost:3000/${s.workspaceId}/team`, { waitUntil: 'domcontentloaded' })
    // Settle properly: wait for the folder grid, then let it stop changing.
    await p.waitForFunction(() => (document.body.innerText || '').includes('THƯ MỤC'), undefined, { timeout: 25_000 }).catch(() => {})
    let prev = ''
    for (let i = 0; i < 10; i++) {
        const now = await p.evaluate(() => (document.body.innerText || '').length.toString())
        if (now === prev) break
        prev = now
        await p.waitForTimeout(1200)
    }
    const before = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    console.log(`  trang đã ổn định ở ${before.length} ký tự — giờ mới ngắt mạng`)

    await ctx.setOffline(true)
    const btn = p.locator('button').filter({ hasText: /Sắp xếp|Giao diện|Danh sách|Lưới/ }).first()
    if (await btn.count()) { await btn.click({ timeout: 5000 }).catch(() => {}) ; console.log('  đã bấm một nút cần gọi máy chủ') }
    await p.goto(`http://localhost:3000/${s.workspaceId}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 12_000 }).catch(() => console.log('  điều hướng khi mất mạng: THẤT BẠI (đúng như mong đợi)'))
    await p.waitForTimeout(4000)
    const after2 = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' '))
    const added = after2.split(' ').filter((w) => w && !before.includes(w)).join(' ').slice(0, 240)
    const saidSomething = /lỗi|mất kết nối|offline|thử lại|không thể|kiểm tra kết nối/i.test(after2)
    console.log(`  chữ mới trên màn hình: ${added || '(không có gì mới)'}`)
    console.log(`  ➜ có câu nào nói cho người dùng biết mất mạng không? ${saidSomething ? 'CÓ' : '❌ KHÔNG'}`)
    await p.screenshot({ path: join(OUT, 'shots', 'VERIFY-offline2.png') })
    await ctx.setOffline(false)
    await b.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
