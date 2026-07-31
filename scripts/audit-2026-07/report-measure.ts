/** Turn measure-controls.json into the Phase 3 pixel / responsive / accessibility findings. */
import { readFileSync } from 'fs'
import { join } from 'path'

const OUT = process.env.AUDIT_OUT_DIR!
type Ctrl = {
    screen: string; shell: string; viewport: number
    tag: string; label: string; kind: string
    w: number; h: number; hit: number; padY: string; radius: number
    fontSize: number; fontWeight: string; lineHeight: number
    fg: string; bg: string; contrast: number | null; disabled: boolean
}
type Layout = { screen: string; shell: string; viewport: number; scrollW: number; clientW: number; navCount: number; btnCount: number; overflow: boolean }
const { controls, layout } = JSON.parse(readFileSync(join(OUT, 'measure-controls.json'), 'utf8')) as { controls: Ctrl[]; layout: Layout[] }

console.log(`ĐÃ ĐO: ${controls.length} thành phần điều khiển · ${layout.length} mốc bố cục\n`)

/* ── 1. Vùng bấm ─────────────────────────────────────────────────────────── */
// WCAG 2.2 AA (2.5.8) tối thiểu 24×24 CSS px. Khuyến nghị cảm ứng (Apple/Google): 44×44.
console.log('[1] VÙNG BẤM — chuẩn WCAG 2.2 AA là 24px, khuyến nghị cảm ứng là 44px')
for (const shell of ['desktop', 'mobile']) {
    const set = controls.filter((c) => c.shell === shell && !c.disabled)
    if (!set.length) continue
    const under24 = set.filter((c) => c.hit < 24)
    const under44 = set.filter((c) => c.hit < 44)
    console.log(`  ${shell.padEnd(8)} tổng ${String(set.length).padStart(4)} · dưới 24px: ${String(under24.length).padStart(3)} (${Math.round(under24.length / set.length * 100)}%) · dưới 44px: ${String(under44.length).padStart(4)} (${Math.round(under44.length / set.length * 100)}%)`)
    const worst = [...new Map(under24.map((c) => [`${c.screen}|${c.label}|${c.kind}`, c])).values()].sort((a, b) => a.hit - b.hit).slice(0, 8)
    for (const c of worst) console.log(`      ${String(c.hit).padStart(5)}px  ${c.kind.padEnd(10)} "${c.label || '(không nhãn)'}" — ${c.screen} @${c.viewport}px`)
}

/* ── 2. Tương phản màu ───────────────────────────────────────────────────── */
// WCAG AA: 4.5:1 cho chữ thường, 3:1 cho chữ lớn (>=18.66px bold hoặc >=24px).
console.log('\n[2] TƯƠNG PHẢN MÀU — chuẩn WCAG AA: 4.5:1 (chữ thường), 3:1 (chữ lớn)')
const needed = (c: Ctrl) => (c.fontSize >= 24 || (c.fontSize >= 18.66 && parseInt(c.fontWeight) >= 700)) ? 3 : 4.5
const withC = controls.filter((c) => c.contrast != null && !c.disabled && c.label)
const fail = withC.filter((c) => (c.contrast as number) < needed(c))
console.log(`  đo được ${withC.length} · KHÔNG ĐẠT ${fail.length} (${withC.length ? Math.round(fail.length / withC.length * 100) : 0}%)`)
const failU = [...new Map(fail.map((c) => [`${c.label}|${c.kind}|${c.fg}`, c])).values()].sort((a, b) => (a.contrast as number) - (b.contrast as number)).slice(0, 10)
for (const c of failU) console.log(`      ${String(c.contrast).padStart(5)}:1 cần ${needed(c)}:1 · ${String(c.fontSize)}px ${c.fontWeight} · "${c.label}" — ${c.screen}`)

/* ── 3. Tràn ngang ───────────────────────────────────────────────────────── */
console.log('\n[3] TRÀN NGANG — trang bị đẩy rộng hơn màn hình, người dùng phải cuộn ngang')
const ov = layout.filter((l) => l.overflow)
if (!ov.length) console.log('  ✓ Không màn nào tràn ngang ở mọi kích thước đã thử.')
for (const l of ov) console.log(`  ✗ ${l.shell.padEnd(8)} ${String(l.viewport).padStart(5)}px  ${l.screen.padEnd(20)} nội dung rộng ${l.scrollW}px / khung ${l.clientW}px (thừa ${l.scrollW - l.clientW}px)`)

/* ── 4. Mất chức năng khi màn hình nhỏ ───────────────────────────────────── */
console.log('\n[4] SỐ HÀNH ĐỘNG HIỂN THỊ theo kích thước — phát hiện nút biến mất')
for (const scr of [...new Set(layout.map((l) => l.screen))]) {
    const d = layout.filter((l) => l.screen === scr && l.shell === 'desktop').sort((a, b) => a.viewport - b.viewport)
    const m = layout.filter((l) => l.screen === scr && l.shell === 'mobile').sort((a, b) => a.viewport - b.viewport)
    console.log(`  ${scr}`)
    console.log(`    máy tính : ${d.map((l) => `${l.viewport}px→${l.btnCount}nút/${l.navCount}menu`).join('  ')}`)
    if (m.length) console.log(`    điện thoại: ${m.map((l) => `${l.viewport}px→${l.btnCount}nút/${l.navCount}menu`).join('  ')}`)
}

/* ── 5. Chữ quá nhỏ ──────────────────────────────────────────────────────── */
console.log('\n[5] CỠ CHỮ NHỎ — dưới 12px là ngưỡng khó đọc trên thực tế')
const tiny = [...new Map(controls.filter((c) => c.fontSize > 0 && c.fontSize < 12 && c.label).map((c) => [`${c.label}|${c.fontSize}`, c])).values()]
console.log(`  ${tiny.length} thành phần dưới 12px`)
for (const c of tiny.slice(0, 8)) console.log(`      ${c.fontSize}px  "${c.label}" — ${c.screen} (${c.shell})`)

/* ── 6. Cùng một hành động, kích thước khác nhau ─────────────────────────── */
console.log('\n[6] THIẾU NHẤT QUÁN — cùng nhãn nút nhưng cao thấp khác nhau giữa các màn')
const byLabel = new Map<string, Set<number>>()
for (const c of controls.filter((x) => x.shell === 'desktop' && x.viewport === 1440 && x.label && x.tag === 'button')) {
    byLabel.set(c.label, (byLabel.get(c.label) ?? new Set()).add(c.h))
}
const incon = [...byLabel.entries()].filter(([, hs]) => hs.size > 1)
console.log(`  ${incon.length} nhãn nút có nhiều chiều cao khác nhau`)
for (const [l, hs] of incon.slice(0, 8)) console.log(`      "${l}" → cao ${[...hs].sort((a, b) => a - b).join('px, ')}px`)
