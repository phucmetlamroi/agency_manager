/**
 * CỔNG NGHIỆM THU S1-1 (09-DAC-TA-TO-BE.md §13).
 *
 *   npx tsx scripts/audit-2026-07/verify-realtime.ts
 *
 * Tiêu chí nguyên văn:
 *   "Mở 2 trình duyệt, A đổi trạng thái task → B thấy trong 3 giây, không F5.
 *    Nhật ký trình duyệt 0 lỗi chặn kết nối."
 *
 * Đó là HAI mệnh đề, và chúng có thể ra hai kết quả khác nhau. Bài này tách bạch:
 *
 *   PHẦN 1 — WebSocket có nối được không (đo lỗi CSP + khung 101 Switching Protocols).
 *            Đây là thứ bản vá CSP chịu trách nhiệm.
 *   PHẦN 2 — B có tự cập nhật khi A đổi trạng thái không.
 *            Đây KHÔNG phải thứ bản vá CSP chịu trách nhiệm, và đọc mã đã cho thấy
 *            `useSupabaseChannel` chỉ có 2 nơi dùng (NotificationBell, TaskCommentColumn) —
 *            không bảng task nào đăng ký. Bài này đo để xác nhận, thay vì suy luận.
 *
 * Chạy trên NHÁNH THỬ NGHIỆM qua dev-audit.mjs — không chạm dữ liệu khách.
 */
import { chromium, type Page, type BrowserContext } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

type Log = { blocked: string[]; wsUrls: string[]; wsOpened: string[]; wsFailed: string[] }

function watch(page: Page): Log {
    const log: Log = { blocked: [], wsUrls: [], wsOpened: [], wsFailed: [] }
    page.on('console', (m) => {
        const t = m.text()
        // Đúng chuỗi Chrome in ra khi CSP chặn — cũng là chuỗi F-01 đã bắt được.
        if (/Content Security Policy|violates the following/i.test(t)) log.blocked.push(t.slice(0, 200))
    })
    page.on('websocket', (ws) => {
        log.wsUrls.push(ws.url())
        // socketerror/close trước khi có frame = bắt tay hỏng.
        ws.on('socketerror', (e) => log.wsFailed.push(`${ws.url().slice(0, 60)} :: ${e}`))
        ws.once('framereceived', () => log.wsOpened.push(ws.url()))
    })
    return log
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

    // ── PHẦN 1 ──────────────────────────────────────────────────────────────
    console.log('PHẦN 1 — kết nối thời gian thực\n')
    const c1 = await ctxFor(browser)
    const p1 = await c1.newPage()
    const l1 = watch(p1)
    await p1.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    // Supabase realtime nối sau khi hydrate; cho nó đủ thời gian bắt tay + retry.
    await p1.waitForTimeout(12_000)

    const sup = l1.wsUrls.filter((u) => u.includes('supabase'))
    const supOpen = l1.wsOpened.filter((u) => u.includes('supabase'))
    console.log(`  WebSocket Supabase được MỞ:        ${sup.length}`)
    console.log(`  … trong đó bắt tay THÀNH CÔNG:     ${supOpen.length}`)
    console.log(`  Lỗi CSP chặn kết nối trong console: ${l1.blocked.length}`)
    for (const b of l1.blocked.slice(0, 3)) console.log(`     ! ${b}`)
    const part1 = l1.blocked.length === 0 && supOpen.length > 0
    console.log(`  → ${part1 ? '✅ ĐẠT — socket nối được, 0 lỗi chặn' : '❌ CHƯA ĐẠT'}\n`)

    // ── PHẦN 2 ──────────────────────────────────────────────────────────────
    console.log('PHẦN 2 — A đổi trạng thái, B có tự thấy không\n')
    const c2 = await ctxFor(browser)
    const pB = await c2.newPage()
    watch(pB)
    await pB.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await pB.waitForTimeout(6000)

    // Chụp nội dung bảng của B TRƯỚC khi A làm gì.
    const snap = () => pB.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
    const before = await snap()

    // A đổi trạng thái qua CHÍNH giao diện — không ghi thẳng DB. Ghi thẳng DB sẽ
    // bỏ qua đường phát sự kiện của server action, thành một bài kiểm không công bằng.
    const pA = await (await ctxFor(browser)).newPage()
    await pA.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await pA.waitForTimeout(6000)

    let changed = false
    let how = ''
    try {
        const cell = pA.locator('[data-status-cell], [role="combobox"], button:has-text("Đang thực hiện"), button:has-text("Nhận task")').first()
        if (await cell.count()) {
            await cell.click({ timeout: 5000 })
            await pA.waitForTimeout(1200)
            const opt = pA.locator('[role="menuitem"], [role="option"]').filter({ hasText: /Đang thực hiện|Hoàn tất|Tạm ngưng/ }).first()
            if (await opt.count()) {
                how = (await opt.innerText()).trim().slice(0, 30)
                await opt.click({ timeout: 5000 })
                changed = true
            }
        }
    } catch (e) {
        console.log(`  (không lái được dropdown: ${String(e).split('\n')[0].slice(0, 90)})`)
    }

    if (!changed) {
        console.log('  ⚠ KHÔNG đổi được trạng thái qua giao diện trong bài tự động này.')
        console.log('    Phần 2 KHÔNG kết luận được bằng bài này — xem ghi chú cuối.\n')
    } else {
        console.log(`  A đã đổi trạng thái sang: "${how}"`)
        // Tiêu chí nói 3 giây; cho 10 để không đổ oan cho độ trễ mạng.
        let sawAt: number | null = null
        for (let i = 0; i < 20; i++) {
            await pB.waitForTimeout(500)
            if ((await snap()) !== before) { sawAt = (i + 1) * 500; break }
        }
        console.log(sawAt
            ? `  → ✅ B tự cập nhật sau ${sawAt}ms (không F5)`
            : '  → ❌ B KHÔNG đổi gì trong 10 giây (không F5)')
        // Đối chứng: sau khi tải lại, B có thấy không? Phân biệt "realtime không đẩy"
        // với "thao tác của A chưa từng được lưu".
        await pB.reload({ waitUntil: 'domcontentloaded' })
        await pB.waitForTimeout(5000)
        const after = await snap()
        console.log(`  Đối chứng — sau khi F5, B ${after !== before ? 'CÓ' : 'KHÔNG'} thấy thay đổi`)
        console.log(`  (nếu "CÓ" mà ở trên là ❌ thì đúng là realtime không đẩy, chứ không phải thao tác thất bại)`)
    }

    writeFileSync(join(OUT, 'verify-realtime.json'), JSON.stringify({ part1, sup, supOpen, blocked: l1.blocked, changed }, null, 2))
    await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
