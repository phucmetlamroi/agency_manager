/**
 * Nghiệm thu Phase C — S2-1 (điều hướng theo quyền), S2-3 (404), S2-6 (trạng thái rỗng),
 * và ĐO LẠI S2-2 (mất mạng) bằng một nút THẬT SỰ gọi máy chủ.
 *
 *   npx tsx scripts/audit-2026-07/verify-phase-c.ts
 *
 * ─── VÌ SAO PHẢI ĐO LẠI S2-2 ───────────────────────────────────────────────
 * Phép đo gốc (probe-states-keyboard.ts dòng 90) ngắt mạng rồi bấm một nút khớp
 * /Làm mới|Tải|Sắp xếp|Giao diện/ trên trang Tệp. Đó là các nút XỬ LÝ TẠI CHỖ
 * (đổi cách sắp xếp, đổi kiểu hiển thị) — chúng KHÔNG gọi máy chủ. Không có phản
 * hồi là đúng, không phải lỗi. Bài này bấm nút "Bắt đầu" của một task, thứ thật
 * sự gọi server action updateTaskStatus.
 *
 * CHỈ ĐỌC với dữ liệu: lần bấm khi mất mạng KHÔNG thể tới được máy chủ, nên không
 * có gì bị ghi. Mạng được bật lại ngay sau đó và bài kiểm dừng.
 */
import { chromium, type BrowserContext, type Page } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

type RoleKey = 'owner' | 'admin' | 'staff' | 'guest'

async function ctxFor(browser: Awaited<ReturnType<typeof chromium.launch>>, role: RoleKey): Promise<BrowserContext> {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addCookies([
        { name: 'session', value: s.roles[role].cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    // Turbopack dev đôi khi thiếu helper này trong bundle client — vô hại, chặn crash sớm.
    await c.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    return c
}

/** Danh sách mục điều hướng ĐANG HIỆN trong sidebar. */
async function navItems(page: Page) {
    return await page.evaluate(() => {
        const aside = document.querySelector('aside')
        if (!aside) return []
        return Array.from(aside.querySelectorAll('nav a')).map((a) => ({
            label: ((a as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim(),
            href: (a as HTMLAnchorElement).getAttribute('href') || '',
        })).filter((x) => x.href && !x.href.startsWith('mailto:'))
    })
}

const results: any = {}

async function main() {
    const browser = await chromium.launch()

    /* ── 1. S2-1 · Editor bấm MỌI mục sidebar → có bị ném về không? ───────── */
    console.log('[1] S2-1 — EDITOR đi hết thanh bên\n')
    const staffPage = await (await ctxFor(browser, 'staff')).newPage()
    await staffPage.goto(`${BASE}/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    await staffPage.waitForTimeout(9000)
    const staffNav = await navItems(staffPage)
    console.log(`  Sidebar hiện ${staffNav.length} mục: ${staffNav.map((i) => i.label).join(' · ')}\n`)

    const bounces: any[] = []
    for (const item of staffNav) {
        await staffPage.goto(`${BASE}${item.href}`, { waitUntil: 'domcontentloaded' })
        await staffPage.waitForTimeout(2500)
        const landed = new URL(staffPage.url()).pathname
        const bounced = landed !== item.href
        if (bounced) bounces.push({ ...item, landed })
        console.log(`  ${bounced ? '❌ BỊ NÉM VỀ' : '✓ vào được  '} ${item.label.padEnd(22)} ${item.href}${bounced ? ` → ${landed}` : ''}`)
    }
    results.s2_1_staff = { shown: staffNav.length, bounces }
    console.log(`\n  ⇒ ${bounces.length} lần bị ném về trên ${staffNav.length} mục\n`)

    /* ── 2. S2-1 · Chủ workspace vẫn thấy đủ ─────────────────────────────── */
    const ownerPage = await (await ctxFor(browser, 'owner')).newPage()
    await ownerPage.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await ownerPage.waitForTimeout(9000)
    const ownerNav = await navItems(ownerPage)
    console.log(`[2] CHỦ SỞ HỮU thấy ${ownerNav.length} mục: ${ownerNav.map((i) => i.label).join(' · ')}\n`)
    results.s2_1_owner = ownerNav

    /* ── 3. S2-3 · 404 ───────────────────────────────────────────────────── */
    console.log('[3] S2-3 — gõ địa chỉ sai\n')
    const badUrls = [
        `/${WS}/dashboard/khong-co-trang-nay`,
        `/${WS}/admin/khong-co-trang-nay`,
        `/hoan-toan-khong-ton-tai`,
    ]
    results.s2_3 = []
    for (const u of badUrls) {
        const resp = await ownerPage.goto(`${BASE}${u}`, { waitUntil: 'domcontentloaded' })
        await ownerPage.waitForTimeout(2500)
        // Đọc TOÀN BỘ nội dung, không cắt: trong vỏ ứng dụng, chữ của thanh bên đứng
        // trước, nên cắt 120 ký tự đầu sẽ bỏ sót thẻ 404 nằm bên dưới.
        const info = await ownerPage.evaluate(() => {
            const full = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
            return {
                full,
                text: full.slice(0, 120),
                hasSidebar: !!document.querySelector('aside nav a'),
                buttons: Array.from(document.querySelectorAll('button, a[href]'))
                    .filter((b) => (b as HTMLElement).offsetParent !== null)
                    .map((b) => ((b as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
                    .filter(Boolean).slice(0, 20),
            }
        })
        const vietnamese = /Không tìm thấy trang này/i.test(info.full)
        const hasWayOut = /Quay lại/i.test(info.full)
        results.s2_3.push({ url: u, status: resp?.status(), ...info, vietnamese, hasWayOut })
        console.log(`  ${u}`)
        console.log(`    HTTP ${resp?.status()} · báo "không tìm thấy": ${vietnamese ? 'CÓ' : '❌ KHÔNG'} · có nút quay lại: ${hasWayOut ? 'CÓ' : '❌ KHÔNG'} · giữ thanh bên: ${info.hasSidebar ? 'CÓ' : 'KHÔNG'}`)
        console.log(`    trích: "${(info.full.match(/404[\s\S]{0,110}/) || [info.text])[0]}"\n`)
    }

    /* ── 4. S2-6 · Ba nhánh rỗng ─────────────────────────────────────────── */
    console.log('[4] S2-6 — ba lý do rỗng, ba câu\n')
    await staffPage.goto(`${BASE}/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    await staffPage.waitForTimeout(8000)

    const readEmpty = () => staffPage.evaluate(() => {
        const el = document.querySelector('[role="status"]')
        return {
            text: el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : '(bảng có dữ liệu — không có vùng rỗng)',
            hasClearBtn: !!Array.from(document.querySelectorAll('button')).find((b) => /Xóa bộ lọc/i.test((b as HTMLElement).innerText || '')),
        }
    })

    const withRows = await readEmpty()
    console.log(`  a) Tab đang có task     : "${withRows.text}"`)

    // (b) Lọc không ra — bơm qua đúng kênh mà thanh trên cùng dùng.
    await staffPage.evaluate(() => {
        window.dispatchEvent(new CustomEvent('user-home-search', { detail: 'zzz-khong-bao-gio-khop-zzz' }))
    })
    await staffPage.waitForTimeout(1500)
    const searched = await readEmpty()
    console.log(`  b) Lọc không ra kết quả : "${searched.text}"`)
    console.log(`     có nút "Xóa bộ lọc"  : ${searched.hasClearBtn ? 'CÓ' : '❌ KHÔNG'}`)

    // Bấm "Xóa bộ lọc" — phải xoá luôn chữ trong ô tìm kiếm ở thanh trên cùng.
    let clearedInput = 'không kiểm được'
    if (searched.hasClearBtn) {
        await staffPage.locator('button', { hasText: 'Xóa bộ lọc' }).first().click().catch(() => {})
        await staffPage.waitForTimeout(1200)
        clearedInput = await staffPage.evaluate(() => {
            const inp = Array.from(document.querySelectorAll('input')).find((i) => /tìm/i.test((i as HTMLInputElement).placeholder || ''))
            return inp ? `ô tìm kiếm = "${(inp as HTMLInputElement).value}"` : 'ô tìm kiếm đang thu gọn'
        })
        console.log(`     sau khi bấm xoá      : ${clearedInput}`)
    }

    // (c) Tab khác — không có task ở trạng thái đó.
    const tabs = staffPage.locator('button, [role="tab"]').filter({ hasText: /Hoàn tất|Đang thực hiện|Revision/ })
    let tabEmpty = { text: '(không bấm được tab nào)', hasClearBtn: false }
    if (await tabs.count()) {
        await tabs.first().click().catch(() => {})
        await staffPage.waitForTimeout(1500)
        tabEmpty = await readEmpty()
    }
    console.log(`  c) Tab khác rỗng        : "${tabEmpty.text}"`)

    const threeDistinct = new Set([withRows.text, searched.text, tabEmpty.text]).size
    results.s2_6 = { withRows, searched, clearedInput, tabEmpty, threeDistinct }
    console.log(`\n  ⇒ số câu KHÁC nhau: ${threeDistinct}/3\n`)

    /* ── 5. S2-2 · Mất mạng, bấm nút THẬT SỰ gọi máy chủ ──────────────────── */
    console.log('[5] S2-2 — ngắt mạng rồi bấm một nút gọi máy chủ\n')
    const netCtx = await ctxFor(browser, 'staff')
    const netPage = await netCtx.newPage()
    await netPage.goto(`${BASE}/${WS}/dashboard`, { waitUntil: 'domcontentloaded' })
    await netPage.waitForTimeout(10000)

    // Mở một task ở trạng thái "Nhận task" → PreStartBlockModal có nút "Bắt đầu",
    // nút này gọi server action updateTaskStatus. Đây đúng là kịch bản F-15 mô tả.
    const seenMark = await netPage.evaluate(() => (document.body.innerText || '').includes('Dựng video mở màn'))
    console.log(`  Task kiểm toán có trên trang: ${seenMark ? 'CÓ' : 'KHÔNG'}`)
    // Bám vào ĐÚNG tiêu đề task. KHÔNG dùng chuỗi "KIỂM TOÁN": tên hiển thị của chính
    // tài khoản thử nghiệm cũng chứa chuỗi đó, nên .first() sẽ bắt trúng nút hồ sơ ở
    // thanh trên cùng thay vì hàng task (đã dính đúng bẫy này một lần).
    // `visible: true` là bắt buộc: bảng dựng cả biến thể desktop lẫn mobile trong DOM,
    // bản ẩn đứng trước nên .first() trần sẽ trỏ vào phần tử không bấm được (hết giờ chờ).
    const titleCell = netPage.getByText(/Dựng video mở màn/).filter({ visible: true }).first()
    await titleCell.click({ timeout: 8000 }).catch(async (e) => {
        console.log('  bấm thường lỗi:', String(e).split('\n')[0].slice(0, 90), '→ thử bắn sự kiện thẳng')
        await netPage.getByText(/Dựng video mở màn/).first().dispatchEvent('click').catch(() => {})
    })
    await netPage.waitForTimeout(2500)
    const openButtons = await netPage.evaluate(() => Array.from(document.querySelectorAll('button'))
        .filter((x) => (x as HTMLElement).offsetParent)
        .map((x) => ((x as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean).slice(0, 20))
    console.log(`  Nút đang hiện sau khi mở task: ${JSON.stringify(openButtons)}`)
    const candidates = netPage.locator('button').filter({ hasText: /Bắt đầu/ })
    const n = await candidates.count()
    console.log(`  Tìm thấy ${n} nút "Bắt đầu" (gọi server action updateTaskStatus)`)

    let offlineResult: any = { skipped: true, reason: 'không tìm thấy nút gọi máy chủ nào trên trang' }
    if (n > 0) {
        const before = await netPage.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
        await netCtx.setOffline(true)
        const label = (await candidates.first().innerText()).trim().slice(0, 30)
        await candidates.first().click({ timeout: 6000 }).catch(() => {})

        // Toast của sonner render vào một portal ngoài cây trang — phải soi riêng.
        let sawFeedback = false
        let toastText = ''
        let ms = 0
        for (let i = 0; i < 16; i++) {
            await netPage.waitForTimeout(500)
            ms = (i + 1) * 500
            const t = await netPage.evaluate(() => {
                const list = document.querySelector('[data-sonner-toaster]')
                const txt = list ? (list as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : ''
                const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
                return { txt, bodyLen: body.length }
            })
            if (t.txt) { sawFeedback = true; toastText = t.txt; break }
        }
        await netCtx.setOffline(false)
        const after = await netPage.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
        offlineResult = { button: label, sawFeedback, toastText, ms, beforeLen: before.length, afterLen: after.length }
        console.log(`  Bấm "${label}" khi mất mạng`)
        console.log(`  Có phản hồi cho người dùng? ${sawFeedback ? `CÓ sau ${ms}ms — "${toastText}"` : '❌ KHÔNG, im lặng trong 8 giây'}`)
    } else {
        console.log('  ⚠ Bỏ qua — không có nút phù hợp trên trang này.')
    }
    results.s2_2 = offlineResult
    console.log('')

    writeFileSync(join(OUT, 'verify-phase-c.json'), JSON.stringify(results, null, 2))
    console.log(`Đã ghi ${join(OUT, 'verify-phase-c.json')}`)
    await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
