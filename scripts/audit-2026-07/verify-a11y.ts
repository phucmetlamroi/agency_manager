/**
 * CỔNG NGHIỆM THU §8 + §12 (09-DAC-TA-TO-BE.md).
 *
 *   npx tsx scripts/audit-2026-07/verify-a11y.ts
 *
 * ─── VÌ SAO KHÔNG DÙNG LẠI measure-controls.ts ──────────────────────────────
 * measure-controls.ts được viết cho Phase 3 (khảo sát), không phải để nghiệm
 * thu. Nó KHÔNG đủ tư cách chứng nhận §12, vì ba lý do đọc thẳng từ mã của nó:
 *
 *   1. Dòng 91 chỉ chọn `button, a[role=button], input, select, textarea,
 *      [role=tab|switch|checkbox]`. Toàn bộ <span>, <div>, <p>, <td>, <label>,
 *      tiêu đề — tức PHẦN LỚN thứ mà §12 gọi là "nhãn" — không bao giờ được đo.
 *   2. Dòng 96 đọc `getComputedStyle(el).color` của CHÍNH nút, trong khi dòng 98
 *      gộp `innerText` của cả cây con làm nhãn. Một nút có tiêu đề trắng và dòng
 *      phụ xám bị chấm MỘT lần, theo màu của nút.
 *   3. Dòng 92 `.slice(0, 60)` cắt còn 60 phần tử đầu mỗi lần tải trang.
 *
 * Chính đợt kiểm toán đã tự chứng minh điều này: nhãn 'Đã hủy' ở 2,56:1 — tệ
 * hơn mọi thứ trong bản khảo sát — lọt lưới vì nó không phải phần tử điều khiển.
 *
 * File này đo cái §8 và §12 thật sự nói tới:
 *   §8  MỌI phần tử tương tác, không cắt số lượng  -> ngưỡng 24×24 (WCAG 2.2 SC 2.5.8)
 *   §12 MỌI nút văn bản có chữ thật, đọc màu của ĐÚNG phần tử chứa chữ
 *       -> 4,5:1, hoặc 3:1 nếu là "chữ lớn" (≥24px, hoặc ≥18,66px in đậm)
 *
 * Phép hợp màu nền giữ nguyên bản ĐÃ SỬA của measure-controls.ts: gom các lớp
 * nền bán trong suốt rồi trộn ngược xuống. Bản đầu tiên coi `rgba(...,0.15)` là
 * màu đặc và đẻ ra con số "41% nhãn hỏng" hoàn toàn sai, sau phải rút.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { chromium, type Page } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

const SCREENS = [
    { path: `/${WS}/dashboard`, name: 'Bảng điều khiển' },
    { path: `/${WS}/team`, name: 'Tệp — trình duyệt' },
    { path: `/${WS}/admin/payroll`, name: 'Bảng lương' },
]

type TextFail = { screen: string; shell: string; text: string; fg: string; bg: string; ratio: number; need: number; fontSize: number; weight: string; tag: string }
type SizeFail = { screen: string; shell: string; label: string; tag: string; w: number; h: number }

async function scan(page: Page, screen: string, shell: string) {
    return await page.evaluate(({ screen, shell }) => {
        // Khai báo helper BÊN TRONG hàm chạy trong trình duyệt — bài học từ
        // measure-controls.ts: hàm truyền vào dạng chuỗi rồi eval() không trở
        // thành biến toàn cục trong scope của Playwright, mọi lời gọi đều ném lỗi.
        const lum = (c: number[]) => {
            const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        const parse = (str: string): number[] | null => {
            const m = str.match(/rgba?\(([^)]+)\)/)
            if (!m) return null
            const p = m[1].split(',').map((x) => parseFloat(x))
            if (p.length > 3 && p[3] === 0) return null
            return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
        }
        const effBg = (el: Element): number[] => {
            const layers: number[][] = []
            let n: Element | null = el
            while (n) {
                const c = parse(getComputedStyle(n).backgroundColor)
                if (c) { layers.push(c); if (c[3] >= 0.999) break }
                n = n.parentElement
            }
            let out = [0, 0, 0]
            for (let i = layers.length - 1; i >= 0; i--) {
                const [r, g, b, a] = layers[i]
                out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]
            }
            return out
        }
        const ratio = (fg: number[], bg: number[]) => {
            const a = lum(fg) + 0.05, b = lum(bg) + 0.05
            return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100
        }
        const visible = (el: Element, cs: CSSStyleDeclaration) => {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) return false
            if (cs.visibility === 'hidden' || cs.display === 'none') return false
            if (parseFloat(cs.opacity) < 0.1) return false // gần như vô hình
            return true
        }

        const textFails: Record<string, unknown>[] = []
        const sizeFails: Record<string, unknown>[] = []
        let textChecked = 0
        let ctrlChecked = 0

        // ── §12: MỌI phần tử có chữ THẬT của riêng nó ──────────────────────
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            // Chỉ lấy phần tử có text node TRỰC TIẾP — nếu không, một <div> bọc
            // ngoài sẽ bị chấm bằng màu của nó trong khi chữ nằm ở <span> con
            // với màu khác. Đây đúng là lỗi khiến bản đo cũ nhìn sót.
            const own = Array.from(el.childNodes)
                .filter((n) => n.nodeType === 3)
                .map((n) => n.textContent || '')
                .join('')
                .trim()
            if (own.length < 2) continue
            const cs = getComputedStyle(el)
            if (!visible(el, cs)) continue
            // WCAG 1.4.3 miễn trừ thành phần đã vô hiệu hoá.
            if (cs.pointerEvents === 'none') continue
            if ((el as HTMLButtonElement).disabled === true) continue
            if (el.closest('[disabled],[aria-disabled="true"]')) continue

            const fg = parse(cs.color)
            if (!fg) continue
            textChecked++
            const size = parseFloat(cs.fontSize)
            const weight = parseInt(cs.fontWeight) || 400
            // "Chữ lớn" = ≥24px thường, hoặc ≥18,66px in đậm (≥700).
            const large = size >= 24 || (size >= 18.66 && weight >= 700)
            const need = large ? 3 : 4.5
            const r = ratio(fg, effBg(el))
            if (r < need) {
                // Kèm đường dẫn tổ tiên: một lần đo trước chỉ ra "chữ trắng trên #8B5CF6" mà
                // không cách nào lần ra nguồn bằng grep, vì màu đến từ tổ tiên chứ không phải
                // từ chính phần tử. Không có dòng này thì phát hiện không hành động được.
                const chain: string[] = []
                let n: Element | null = el
                for (let i = 0; n && i < 4; i++, n = n.parentElement) {
                    const cls = typeof n.className === 'string' && n.className.trim()
                        ? '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
                        : ''
                    chain.push(n.tagName.toLowerCase() + cls)
                }
                textFails.push({
                    screen, shell, text: own.replace(/\s+/g, ' ').slice(0, 40),
                    fg: cs.color, bg: `rgb(${effBg(el).map(Math.round).join(',')})`,
                    ratio: r, need, fontSize: size, weight: cs.fontWeight, tag: el.tagName.toLowerCase(),
                    path: chain.join(' < '),
                })
            }
        }

        // ── §8: MỌI phần tử tương tác, KHÔNG cắt số lượng ──────────────────
        const CTRL = 'button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="menuitem"]'
        for (const el of Array.from(document.querySelectorAll(CTRL))) {
            const cs = getComputedStyle(el)
            if (!visible(el, cs)) continue
            if ((el as HTMLButtonElement).disabled === true) continue // miễn trừ
            if (cs.pointerEvents === 'none') continue
            // Loại trừ "inline": SC 2.5.8 miễn cho liên kết nằm trong dòng văn bản.
            if (el.tagName === 'A' && cs.display.startsWith('inline') && el.closest('p')) continue
            ctrlChecked++
            const r = el.getBoundingClientRect()
            const hit = Math.min(r.width, r.height)
            if (hit < 24) {
                sizeFails.push({
                    screen, shell,
                    label: (el.getAttribute('aria-label') || (el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40),
                    tag: el.tagName.toLowerCase(),
                    w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
                })
            }
        }
        return { textFails, sizeFails, textChecked, ctrlChecked }
    }, { screen, shell })
}

async function main() {
    const browser = await chromium.launch()
    const allText: TextFail[] = []
    const allSize: SizeFail[] = []
    let totText = 0, totCtrl = 0

    for (const shell of ['desktop', 'mobile'] as const) {
        const ctx = await browser.newContext({ viewport: shell === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 } })
        await ctx.addCookies([
            { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
            { name: 'view-mode', value: shell, domain: 'localhost', path: '/' },
        ])
        await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
        const page = await ctx.newPage()

        for (const sc of SCREENS) {
            await page.goto(BASE + sc.path, { waitUntil: 'domcontentloaded' })
            // Chờ nội dung xuất hiện thật rồi mới đo. Một khoảng chờ cố định đã
            // từng đẻ ra kết luận sai "nút biến mất theo chiều rộng", sau phải rút.
            await page.waitForFunction(
                () => Array.from(document.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0).length > 2,
                undefined, { timeout: 20_000 },
            ).catch(() => {})
            await page.waitForTimeout(2500)
            // KHÔNG nuốt lỗi: một lỗi bị nuốt ở đây đọc thành "0 vi phạm", trông
            // y hệt một kết quả đạt.
            let got
            try { got = await scan(page, sc.name, shell) }
            catch (e) { console.error(`  !! ĐO THẤT BẠI ${shell} ${sc.name}: ${String(e).split('\n')[0].slice(0, 160)}`); continue }
            allText.push(...(got.textFails as TextFail[]))
            allSize.push(...(got.sizeFails as SizeFail[]))
            totText += got.textChecked; totCtrl += got.ctrlChecked
            console.log(`  ${shell.padEnd(7)} ${sc.name.padEnd(22)} chữ ${String(got.textChecked).padStart(4)} (${got.textFails.length} hỏng)   nút ${String(got.ctrlChecked).padStart(3)} (${got.sizeFails.length} <24px)`)
        }
        await ctx.close()
    }
    await browser.close()

    const key = (f: TextFail) => `${f.text}|${f.fg}|${f.ratio}`
    const uniqText = [...new Map(allText.map((f) => [key(f), f])).values()].sort((a, b) => a.ratio - b.ratio)
    const uniqSize = [...new Map(allSize.map((f) => [`${f.label}|${f.tag}|${f.w}x${f.h}`, f])).values()].sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))

    console.log(`\n══ §12 TƯƠNG PHẢN ══  đã đo ${totText} nút văn bản`)
    console.log(uniqText.length === 0 ? '  ✅ ĐẠT — 0 nhãn dưới ngưỡng' : `  ❌ ${uniqText.length} nhãn riêng biệt dưới ngưỡng:`)
    for (const f of uniqText.slice(0, 25)) console.log(`   ${String(f.ratio).padStart(5)}:1 (cần ${f.need})  ${String(f.fontSize).padStart(4)}px/${f.weight.padEnd(3)} ${f.tag.padEnd(6)} "${f.text}"  ${f.fg} trên ${f.bg}`)
    if (uniqText.length > 25) console.log(`   … và ${uniqText.length - 25} nhãn nữa`)

    console.log(`\n══ §8 VÙNG BẤM ══  đã đo ${totCtrl} phần tử tương tác`)
    console.log(uniqSize.length === 0 ? '  ✅ ĐẠT — 0 phần tử dưới 24px' : `  ❌ ${uniqSize.length} phần tử riêng biệt dưới 24px:`)
    for (const f of uniqSize.slice(0, 25)) console.log(`   ${String(f.w).padStart(6)}×${String(f.h).padEnd(6)} ${f.tag.padEnd(6)} "${f.label}"  [${f.screen}/${f.shell}]`)
    if (uniqSize.length > 25) console.log(`   … và ${uniqSize.length - 25} phần tử nữa`)

    writeFileSync(join(OUT, 'verify-a11y.json'), JSON.stringify({ textFails: uniqText, sizeFails: uniqSize, totText, totCtrl }, null, 2))
    console.log(`\nĐã ghi -> verify-a11y.json`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
