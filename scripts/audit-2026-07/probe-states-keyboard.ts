/**
 * PHASE 3 (closing) — empty / not-found / offline states, and keyboard reachability.
 *
 * Everything here is READ-ONLY: bad URLs, a nonsense search string, and a simulated network
 * outage. No data is created, changed or deleted.
 *
 *   npx tsx scripts/audit-2026-07/probe-states-keyboard.ts
 */
import { chromium, type Page } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

/** Text a lost user needs: what happened, and what to do next. */
const RECOVERY_WORDS = ['quay lại', 'thử lại', 'trở về', 'liên hệ', 'tải lại', 'go back', 'retry']

async function describe(page: Page) {
    return await page.evaluate((words: string[]) => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
        return {
            chars: body.length,
            head: body.slice(0, 180),
            hasRecovery: words.some((w) => body.toLowerCase().includes(w.toLowerCase())),
            buttons: Array.from(document.querySelectorAll('button, a[href]'))
                .filter((b) => b.getBoundingClientRect().width > 0)
                .map((b) => ((b as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
                .filter(Boolean).slice(0, 8),
        }
    }, RECOVERY_WORDS)
}

async function main() {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    await ctx.addCookies([
        { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    const page = await ctx.newPage()
    const results: Record<string, unknown>[] = []

    /* ── A. Địa chỉ không tồn tại ─────────────────────────────────────────── */
    console.log('[A] ĐỊA CHỈ KHÔNG TỒN TẠI — người dùng gõ nhầm hoặc mở link cũ đã hỏng\n')
    const badUrls = [
        { path: `/${WS}/team/folder/khong-ton-tai-12345`, name: 'Thư mục Tệp không có thật' },
        { path: `/${WS}/task/khong-ton-tai-12345`, name: 'Task không có thật' },
        { path: `/khong-phai-workspace/dashboard`, name: 'Workspace không có thật' },
        { path: `/${WS}/trang-khong-co`, name: 'Trang hoàn toàn không tồn tại' },
    ]
    for (const u of badUrls) {
        const resp = await page.goto(BASE + u.path, { waitUntil: 'domcontentloaded' }).catch(() => null)
        await page.waitForTimeout(2500)
        const d = await describe(page)
        const finalPath = new URL(page.url()).pathname
        results.push({ group: 'khong-ton-tai', ...u, status: resp?.status() ?? null, finalPath, ...d })
        console.log(`  ${u.name}`)
        console.log(`      HTTP ${resp?.status() ?? '—'} · dừng ở ${finalPath === u.path ? '(nguyên chỗ)' : finalPath}`)
        console.log(`      màn hình nói: "${d.head.slice(0, 110)}"`)
        console.log(`      có lối thoát cho người dùng? ${d.hasRecovery ? 'CÓ' : '❌ KHÔNG'}\n`)
    }

    /* ── B. Không có kết quả ──────────────────────────────────────────────── */
    console.log('[B] TÌM KHÔNG RA — ô tìm kiếm trả về rỗng\n')
    await page.goto(`${BASE}/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const search = page.locator('input[placeholder*="Tìm"], input[type="search"]').first()
    if (await search.count()) {
        await search.fill('zzzz-khong-bao-gio-co-ket-qua-zzzz')
        await page.waitForTimeout(2200)
        const d = await describe(page)
        results.push({ group: 'rong', name: 'Tìm task không ra kết quả', ...d })
        console.log(`  màn hình nói: "${d.head.slice(0, 160)}"`)
        console.log(`  có gợi ý bước tiếp theo? ${d.hasRecovery ? 'CÓ' : '❌ KHÔNG'}\n`)
    } else {
        console.log('  ❌ không tìm thấy ô tìm kiếm để thử\n')
    }

    /* ── C. Mất mạng ──────────────────────────────────────────────────────── */
    console.log('[C] MẤT MẠNG GIỮA CHỪNG — mô phỏng rớt kết nối rồi thao tác\n')
    await page.goto(`${BASE}/${WS}/team`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const before = await describe(page)
    await ctx.setOffline(true)
    // Click something that must talk to the server, then watch for any feedback.
    const anyBtn = page.locator('button').filter({ hasText: /Làm mới|Tải|Sắp xếp|Giao diện/ }).first()
    if (await anyBtn.count()) await anyBtn.click({ timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(4000)
    const after = await describe(page)
    await ctx.setOffline(false)
    const toldUser = after.chars !== before.chars || /lỗi|mất kết nối|offline|thử lại/i.test(after.head)
    results.push({ group: 'mat-mang', name: 'Thao tác khi mất mạng', before: before.chars, after: after.chars, toldUser, head: after.head })
    console.log(`  độ dài nội dung trước/sau: ${before.chars} → ${after.chars}`)
    console.log(`  hệ thống có báo cho người dùng biết mất mạng không? ${toldUser ? 'CÓ' : '❌ KHÔNG — im lặng'}\n`)

    /* ── D. Bàn phím ──────────────────────────────────────────────────────── */
    console.log('[D] ĐI BẰNG BÀN PHÍM — Tab qua toàn trang Bảng điều khiển\n')
    await page.goto(`${BASE}/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
    const order: string[] = []
    let trapped = false
    await page.evaluate(() => (document.body as HTMLElement).focus())
    for (let i = 0; i < 45; i++) {
        await page.keyboard.press('Tab')
        const cur = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null
            if (!a || a === document.body) return 'BODY'
            const label = (a.getAttribute('aria-label') || a.innerText || (a as HTMLInputElement).placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 30)
            const cs = getComputedStyle(a)
            const ring = cs.outlineWidth !== '0px' || cs.boxShadow !== 'none'
            return `${a.tagName.toLowerCase()}|${label}|${ring ? 'có-viền' : 'KHÔNG-VIỀN'}`
        })
        order.push(cur)
        if (order.length > 6 && order.slice(-4).every((x) => x === cur)) { trapped = true; break }
    }
    const reachable = new Set(order.filter((o) => o !== 'BODY')).size
    const noRing = order.filter((o) => o.includes('KHÔNG-VIỀN')).length
    const totalBtns = await page.locator('button, a[href], input, select').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 0).length)
    results.push({ group: 'ban-phim', reachable, totalBtns, noRing, trapped, order: order.slice(0, 25) })
    console.log(`  Tab 45 lần → chạm được ${reachable} thành phần khác nhau (trang có ${totalBtns} thành phần bấm được)`)
    console.log(`  số bước KHÔNG có viền focus: ${noRing}/${order.length}`)
    console.log(`  bị kẹt vòng lặp focus? ${trapped ? '❌ CÓ' : 'không'}`)
    console.log(`  10 điểm dừng đầu: ${order.slice(0, 10).join('  →  ')}`)

    writeFileSync(join(OUT, 'states-keyboard.json'), JSON.stringify(results, null, 2))
    await browser.close()
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
