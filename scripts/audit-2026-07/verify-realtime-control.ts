/**
 * ĐỐI CHỨNG cho verify-realtime.ts — kiểm tra chính PHÉP ĐO, không kiểm sản phẩm.
 *
 *   npx tsx scripts/audit-2026-07/verify-realtime-control.ts
 *
 * Lần chạy đầu của verify-realtime.ts báo "B tự cập nhật sau 500ms" — đúng nhịp poll
 * ĐẦU TIÊN, và báo đồng thời "0 WebSocket Supabase được mở". Hai điều đó không thể
 * cùng đúng nếu cập nhật đến từ realtime. Nghi ngờ: phép so sánh dùng innerText của
 * CẢ TRANG, nên bất cứ thứ gì tự đổi — dấu thời gian tương đối, một khối đang tải
 * xong, một bộ đếm — đều bị tính là "B đã thấy thay đổi".
 *
 * Bài này để B ngồi yên, KHÔNG ai đổi gì, rồi xem trang có tự đổi chữ không.
 * Nếu có → phép đo cũ vô giá trị và kết luận "realtime chạy" là DƯƠNG TÍNH GIẢ.
 *
 * Bài này cũng trả lời câu của PHẦN 1: vì sao không socket nào được MỞ.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

async function main() {
    const browser = await chromium.launch()
    const c = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await c.addCookies([
        { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
        { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
    ])
    await c.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
    const p = await c.newPage()

    const wsSeen: string[] = []
    p.on('websocket', (w) => wsSeen.push(w.url()))

    await p.goto(`${BASE}/${WS}/admin`, { waitUntil: 'domcontentloaded' })
    await p.waitForTimeout(6000)

    // ── 1. Trang có tự đổi chữ khi KHÔNG ai làm gì không? ──────────────────
    const snap = () => p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').trim())
    const t0 = await snap()
    console.log('ĐỐI CHỨNG — không ai đổi gì, chỉ ngồi nhìn 10 giây\n')
    let firstDiff: number | null = null
    for (let i = 0; i < 20; i++) {
        await p.waitForTimeout(500)
        if (firstDiff === null && (await snap()) !== t0) firstDiff = (i + 1) * 500
    }
    const t1 = await snap()
    console.log(`  Trang tự đổi chữ lần đầu tại: ${firstDiff === null ? 'KHÔNG BAO GIỜ' : firstDiff + 'ms'}`)
    console.log(`  Độ dài chữ: ${t0.length} -> ${t1.length}`)
    console.log(firstDiff !== null
        ? '  ⇒ Phép so sánh innerface-toàn-trang VÔ GIÁ TRỊ. Kết quả "B thấy sau 500ms" là DƯƠNG TÍNH GIẢ.\n'
        : '  ⇒ Trang đứng yên khi không có sự kiện. Phép so sánh dùng được.\n')

    // ── 2. Vì sao không có WebSocket Supabase nào? ─────────────────────────
    console.log('CHẨN ĐOÁN — vì sao không socket nào được mở\n')
    console.log(`  Tổng WebSocket mọi loại: ${wsSeen.length}`)
    for (const u of [...new Set(wsSeen)].slice(0, 5)) console.log(`     ${u.slice(0, 90)}`)

    const diag = await p.evaluate(() => {
        // Client Supabase chỉ được tạo khi CẢ HAI biến NEXT_PUBLIC_* có mặt trong
        // bundle trình duyệt (src/lib/supabase.ts). Next thay chúng vào lúc build,
        // nên nếu thiếu, chuỗi URL sẽ không xuất hiện trong bất kỳ script nào.
        const scripts = Array.from(document.querySelectorAll('script[src]')).map((x) => (x as HTMLScriptElement).src)
        return {
            coBell: !!document.querySelector('[data-notification-bell], [aria-label*="hông báo"], [aria-label*="otification"]'),
            soScript: scripts.length,
            // Cảnh báo do chính src/lib/supabase.ts in ra khi env thiếu.
            html: document.documentElement.innerHTML.includes('supabase.co'),
        }
    })
    console.log(`  Chuông thông báo có trên trang: ${diag.coBell ? 'CÓ' : 'KHÔNG'}`)
    console.log(`  Chuỗi "supabase.co" có trong HTML: ${diag.html ? 'CÓ' : 'KHÔNG'}`)

    await browser.close()
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
