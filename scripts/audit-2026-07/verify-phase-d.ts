/**
 * Nghiệm thu Phase D — §5.3 (video 1 phiên bản) và T-04 (màn Tệp của editor chưa có task).
 *
 *   npx tsx scripts/audit-2026-07/verify-phase-d.ts
 *
 * CHỈ ĐỌC: mở trang, đếm phần tử, không bấm nút ghi nào.
 *
 * Bài kiểm QUAN TRỌNG NHẤT ở đây KHÔNG phải "ẩn được chưa", mà là hai bài chống hồi quy:
 *
 *   1. Nút "Tải phiên bản mới" phải CÒN trên video 1 phiên bản. Nó nằm cùng một thẻ cha
 *      flex với cụm chọn phiên bản vừa bị ẩn; ẩn lẹm sang nó là khoá vĩnh viễn 113 video
 *      ở mức 1 phiên bản — hỏng nặng hơn nhiều so với cái đang sửa.
 *   2. Video >= 2 phiên bản phải giữ NGUYÊN cụm chọn.
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

/** Chọn sẵn từ dữ liệu nhánh thử nghiệm (xem báo cáo Phase D). */
const ASSET_ONE = 'a66249de-f2c2-44ea-95f4-1c9a9ce2036d'   // 1 phiên bản
const ASSET_MANY = '8ee4b750-7fd5-4389-b39d-3b06694c55a5'  // 3 phiên bản

const results: any = {}

async function ctx(browser: any, role: 'owner' | 'staff') {
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addCookies([
        { name: 'session', value: s.roles[role].cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    await c.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    return c
}

async function main() {
    const browser = await chromium.launch()
    const owner = await (await ctx(browser, 'owner')).newPage()

    /* ── §5.3 ─────────────────────────────────────────────────────────────── */
    for (const [label, assetId] of [['1 phiên bản', ASSET_ONE], ['3 phiên bản', ASSET_MANY]] as const) {
        await owner.goto(`${BASE}/${WS}/team/asset/${assetId}`, { waitUntil: 'domcontentloaded' })
        await owner.waitForTimeout(11000)
        const r = await owner.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'))
            const lbl = (b: Element) =>
                ((b.getAttribute('aria-label') || '') + '|' + (b.getAttribute('title') || '') + '|' + ((b as HTMLElement).innerText || '')).trim()
            const visible = btns.filter((b) => (b as HTMLElement).offsetParent !== null)
            return {
                // Cụm CHỌN phiên bản (thứ phải ẩn khi < 2).
                selector: visible.filter((b) => /Chọn phiên bản/i.test(lbl(b))).length,
                // Nút TẠO phiên bản (thứ TUYỆT ĐỐI phải còn).
                uploadNew: visible.filter((b) => /Tải phiên bản mới/i.test(lbl(b))).length,
                // Bất kỳ chữ "v{số}" nào lộ ra trên thanh tiêu đề.
                vBadges: (document.body.innerText.match(/\bv\d+\b/g) || []).slice(0, 6),
                soSanh: visible.filter((b) => /So sánh phiên bản/i.test(lbl(b))).length,
            }
        })
        results[label] = r
        console.log(`[§5.3] ${label}`)
        console.log(`   cụm chọn phiên bản : ${r.selector}   ${label === '1 phiên bản' ? '(phải = 0)' : '(phải >= 1)'}`)
        console.log(`   nút Tải phiên bản mới: ${r.uploadNew}   (PHẢI >= 1 ở CẢ HAI — chống hồi quy)`)
        console.log(`   nhãn v{n} lộ ra    : ${JSON.stringify(r.vBadges)}\n`)
    }

    /* ── T-04 ─────────────────────────────────────────────────────────────── */
    const staff = await (await ctx(browser, 'staff')).newPage()
    await staff.goto(`${BASE}/${WS}/team`, { waitUntil: 'domcontentloaded' })
    await staff.waitForTimeout(12000)
    const t04 = await staff.evaluate(() => {
        const txt = (document.body.innerText || '').replace(/\s+/g, ' ').trim()
        const visible = Array.from(document.querySelectorAll('button')).filter((b) => (b as HTMLElement).offsetParent !== null)
        const has = (re: RegExp) => visible.some((b) => re.test((b as HTMLElement).innerText || ''))
        return {
            noiDungMoi: /Bạn chưa được giao task nào/i.test(txt),
            cauCu: /Chưa có asset nào trong workspace này/i.test(txt),
            cotTraiNoiDoi: /Chưa có thư mục nào\./i.test(txt),
            nutTaiLen: has(/Tải asset lên/i),
            nutThuMucMoi: has(/Thư mục mới/i),
            trich: (txt.match(/Bạn chưa được giao[\s\S]{0,150}/) || [txt.slice(0, 150)])[0],
        }
    })
    results.t04 = t04
    console.log('[T-04] Tệp — tài khoản chưa được giao task nào')
    console.log(`   câu mới ("Bạn chưa được giao task nào") : ${t04.noiDungMoi ? 'CÓ' : '❌ KHÔNG'}`)
    console.log(`   câu cũ còn sót                          : ${t04.cauCu ? '❌ CÒN' : 'hết'}`)
    console.log(`   cột trái còn nói "Chưa có thư mục nào." : ${t04.cotTraiNoiDoi ? '❌ CÒN' : 'hết'}`)
    console.log(`   nút "Tải asset lên"  : ${t04.nutTaiLen ? '❌ CÒN (phải ẩn)' : 'đã ẩn'}`)
    console.log(`   nút "Thư mục mới"    : ${t04.nutThuMucMoi ? 'CÒN (đúng — lối thoát)' : '❌ MẤT (nhốt editor!)'}`)
    console.log(`   trích: "${t04.trich.slice(0, 140)}"\n`)

    writeFileSync(join(OUT, 'verify-phase-d.json'), JSON.stringify(results, null, 2))
    await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
