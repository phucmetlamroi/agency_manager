/**
 * S1-1, vòng ba — đo ĐÚNG THỨ tiêu chí hỏi.
 *
 *   npx tsx scripts/audit-2026-07/verify-realtime-diff.ts
 *
 * Hai vòng trước đều suýt cho kết luận sai, theo hai hướng ngược nhau:
 *
 *   Vòng 1 báo "0 WebSocket Supabase" -> ÂM TÍNH GIẢ. Lần đầu vào /admin, dev
 *           server còn đang biên dịch, socket mở sau cửa sổ 12 giây. Vòng đối
 *           chứng (trang đã biên dịch sẵn) thấy socket ngay.
 *   Vòng 1 báo "B tự cập nhật sau 500ms" -> đúng là trang CÓ đổi (đối chứng
 *           chứng minh trang đứng yên khi không có sự kiện), nhưng KHÔNG chứng
 *           minh được ĐIỀU GÌ đổi. Một badge chuông nhảy 0->1 cũng làm
 *           innerText đổi y hệt như trạng thái task đổi.
 *
 * Tiêu chí hỏi "B THẤY thay đổi trạng thái", nên bài này in ra ĐÚNG những từ đã
 * thêm/bớt trên màn hình B. Nếu phần thêm là nhãn trạng thái mới -> bảng có đẩy.
 * Nếu chỉ là một con số badge -> B chỉ được báo có việc, bảng KHÔNG đổi.
 */
import { chromium, type BrowserContext } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

/** Từ có trong b mà không có trong a (theo số lần xuất hiện). */
function added(a: string, b: string): string[] {
    const count = (t: string) => {
        const m = new Map<string, number>()
        for (const w of t.split(/\s+/)) m.set(w, (m.get(w) || 0) + 1)
        return m
    }
    const ca = count(a), out: string[] = []
    for (const [w, n] of count(b)) {
        const d = n - (ca.get(w) || 0)
        for (let i = 0; i < d; i++) out.push(w)
    }
    return out
}

async function ctxFor(browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<BrowserContext> {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addCookies([
        { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    await c.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    return c
}

async function main() {
    const browser = await chromium.launch()

    // Làm nóng route TRƯỚC khi đo — chính chỗ vòng 1 vấp.
    const warm = await (await ctxFor(browser)).newPage()
    await warm.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await warm.waitForTimeout(8000)
    await warm.close()

    const pB = await (await ctxFor(browser)).newPage()
    const wsB: string[] = []
    const cspB: string[] = []
    pB.on('websocket', (w) => wsB.push(w.url()))
    pB.on('console', (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) cspB.push(m.text().slice(0, 160)) })
    await pB.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await pB.waitForTimeout(9000)

    const snap = () => pB.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
    const before = await snap()

    const pA = await (await ctxFor(browser)).newPage()
    await pA.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await pA.waitForTimeout(8000)

    let how = ''
    try {
        const cell = pA.locator('[data-status-cell], [role="combobox"], button:has-text("Đang thực hiện"), button:has-text("Nhận task")').first()
        await cell.click({ timeout: 6000 })
        await pA.waitForTimeout(1200)
        const opt = pA.locator('[role="menuitem"], [role="option"]').filter({ hasText: /Đang thực hiện|Hoàn tất|Tạm ngưng/ }).first()
        how = (await opt.innerText()).trim().slice(0, 40)
        await opt.click({ timeout: 6000 })
    } catch (e) {
        console.log('KHÔNG đổi được trạng thái qua giao diện:', String(e).split('\n')[0].slice(0, 120))
        await browser.close(); return
    }
    console.log(`A đổi trạng thái -> "${how}"\n`)

    let at: number | null = null
    let after = before
    for (let i = 0; i < 24; i++) {
        await pB.waitForTimeout(500)
        const now = await snap()
        if (now !== before) { at = (i + 1) * 500; after = now; break }
    }

    const socketOk = wsB.some((u) => u.includes('supabase'))
    console.log(`WebSocket Supabase trên B : ${socketOk ? 'CÓ' : 'KHÔNG'}`)
    console.log(`Lỗi CSP chặn kết nối      : ${cspB.length}`)
    console.log(`B đổi chữ lần đầu tại     : ${at === null ? 'KHÔNG ĐỔI trong 12 giây' : at + 'ms'}\n`)

    if (at !== null) {
        const plus = added(before, after)
        const minus = added(after, before)
        console.log(`  Từ ĐƯỢC THÊM trên màn hình B : ${JSON.stringify(plus.slice(0, 25))}`)
        console.log(`  Từ BỊ MẤT   trên màn hình B : ${JSON.stringify(minus.slice(0, 25))}`)
        console.log('\n  ⇒ Đọc kết quả: nếu phần thêm là NHÃN TRẠNG THÁI thì bảng task có đẩy realtime.')
        console.log('    Nếu chỉ là con số badge, B mới chỉ được BÁO, còn bảng thì chưa đổi.')
    }

    writeFileSync(join(OUT, 'verify-realtime-diff.json'), JSON.stringify({ how, at, socketOk, csp: cspB, before, after }, null, 2))
    await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
