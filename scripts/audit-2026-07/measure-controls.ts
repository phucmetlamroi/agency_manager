/**
 * PHASE 3 — pixel + responsive measurement of the default web UI.
 *
 * Two INDEPENDENT mechanisms decide what a user sees, and both are measured:
 *   1. SHELL — chosen server-side from the user agent, or forced by the `view-mode` cookie
 *      (src/middleware.ts:26-35). Resizing the window does NOT switch it. Tablets are
 *      deliberately given the desktop shell ("tablet + undefined ⇒ desktop").
 *   2. CSS BREAKPOINTS inside a shell — Tailwind defaults, since tailwind.config only overrides
 *      `screens` inside `container`: 640 / 768 / 1024 / 1280 / 1536.
 *
 * Every number below comes from getBoundingClientRect + getComputedStyle. Nothing is eyeballed.
 *
 *   npx tsx scripts/audit-2026-07/measure-controls.ts
 */
import { chromium, type Page } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const WS = s.workspaceId

/** Tailwind defaults; each tested at the boundary and 1 CSS px either side. */
const BREAKPOINTS = [640, 768, 1024, 1280, 1536]
const SCREENS = [
    { path: `/${WS}/dashboard`, name: 'Bảng điều khiển' },
    { path: `/${WS}/team`, name: 'Tệp — trình duyệt' },
    { path: `/${WS}/admin/payroll`, name: 'Bảng lương' },
]

type Ctrl = {
    screen: string; shell: string; viewport: number
    tag: string; label: string; kind: string
    w: number; h: number; hit: number
    padY: string; radius: number
    fontSize: number; fontWeight: string; lineHeight: number
    fg: string; bg: string; contrast: number | null
    disabled: boolean; focusVisible: boolean
}

async function measure(page: Page, screen: string, shell: string, viewport: number): Promise<Ctrl[]> {
    return await page.evaluate(({ screen, shell, viewport }) => {
        // Helpers are declared INSIDE the browser function on purpose. An earlier version passed
        // them as a string and eval()'d it — function declarations inside eval do not become
        // globals in Playwright's evaluation scope, so every lookup threw and the whole run
        // silently measured 0 controls.
        const lum = (c: number[]) => {
            const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
            return 0.2126 * r + 0.7152 * g + 0.0722 * b
        }
        /** Returns [r,g,b,a]. Alpha matters: this UI paints many chips at 10–20% opacity. */
        const parse = (s: string): number[] | null => {
            const m = s.match(/rgba?\(([^)]+)\)/)
            if (!m) return null
            const p = m[1].split(',').map((x) => parseFloat(x))
            if (p.length > 3 && p[3] === 0) return null // fully transparent → contributes nothing
            return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]
        }
        /**
         * The colour a human actually sees behind the text.
         *
         * An earlier version stopped at the first non-transparent backgroundColor and used it raw.
         * That was WRONG here: a chip painted `rgba(139,92,246,0.15)` was scored as if it were solid
         * violet, which turned a comfortably readable label into a fake "1.53:1 failure". Semi-
         * transparent layers must be COMPOSITED over whatever is behind them, so collect the stack
         * up to the first opaque layer and blend it back down.
         */
        const effBg = (el: Element): number[] => {
            const layers: number[][] = []
            let n: Element | null = el
            while (n) {
                const c = parse(getComputedStyle(n).backgroundColor)
                if (c) { layers.push(c); if (c[3] >= 0.999) break }
                n = n.parentElement
            }
            let out = [0, 0, 0] // page default behind everything
            for (let i = layers.length - 1; i >= 0; i--) {
                const [r, g, b, a] = layers[i]
                out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)]
            }
            return out
        }
        const contrast = (fg: number[] | null, bg: number[]) => {
            if (!fg) return null
            const a = lum(fg) + 0.05, b = lum(bg) + 0.05
            return Math.round((Math.max(a, b) / Math.min(a, b)) * 100) / 100
        }
        const g = { _parse: parse, _effBg: effBg, _contrast: contrast }
        const out: Record<string, unknown>[] = []
        const nodes = document.querySelectorAll('button, a[role="button"], input, select, textarea, [role="tab"], [role="switch"], [role="checkbox"]')
        for (const el of Array.from(nodes).slice(0, 60)) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || r.height === 0) continue // not rendered
            const cs = getComputedStyle(el)
            const fg = g._parse(cs.color)
            const bg = g._effBg(el)
            const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || (el as HTMLInputElement).placeholder || '').replace(/\s+/g, ' ').trim().slice(0, 40)
            out.push({
                screen, shell, viewport,
                tag: el.tagName.toLowerCase(),
                label,
                kind: el.getAttribute('role') || (el as HTMLInputElement).type || el.tagName.toLowerCase(),
                w: Math.round(r.width * 10) / 10,
                h: Math.round(r.height * 10) / 10,
                // Real tap target = the painted box (no invisible expanders are used in this app).
                hit: Math.round(Math.min(r.width, r.height) * 10) / 10,
                padY: `${cs.paddingTop}/${cs.paddingBottom}`,
                radius: parseFloat(cs.borderRadius) || 0,
                fontSize: parseFloat(cs.fontSize),
                fontWeight: cs.fontWeight,
                lineHeight: parseFloat(cs.lineHeight) || 0,
                fg: cs.color, bg: `rgb(${bg.join(',')})`,
                contrast: g._contrast(fg, bg),
                disabled: (el as HTMLButtonElement).disabled === true || cs.pointerEvents === 'none',
                focusVisible: false,
            })
        }
        return out as unknown as Ctrl[]
    }, { screen, shell, viewport })
}

/** Does the first real button paint a visible focus ring when focused via keyboard? */
async function focusRing(page: Page): Promise<boolean> {
    return await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find((x) => x.getBoundingClientRect().width > 0)
        if (!b) return false
        const before = getComputedStyle(b).outlineWidth + '|' + getComputedStyle(b).boxShadow
        b.focus()
        const after = getComputedStyle(b).outlineWidth + '|' + getComputedStyle(b).boxShadow
        return before !== after
    }).catch(() => false)
}

async function main() {
    const browser = await chromium.launch()
    const rows: Ctrl[] = []
    const layout: Record<string, unknown>[] = []

    for (const shell of ['desktop', 'mobile'] as const) {
        // Force the shell via the app's own cookie rather than faking a UA — same switch the
        // product itself uses, so this measures the real code path (src/middleware.ts:29-31).
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        await ctx.addCookies([
            { name: 'session', value: s.roles.owner.cookie, domain: 'localhost', path: '/' },
            { name: 'view-mode', value: shell, domain: 'localhost', path: '/' },
        ])
        // tsx compiles this file with esbuild's keep-names on, which wraps every function in a
        // `__name(...)` helper. That helper exists in Node, NOT in the page — so any evaluate()
        // containing a named function threw `__name is not defined`. Define a no-op before any
        // page script runs. Passed as a raw string so it is not itself compiled.
        await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
        const page = await ctx.newPage()

        const widths = shell === 'mobile'
            ? [360, 390, 414]
            : BREAKPOINTS.flatMap((b) => [b - 1, b, b + 1]).concat([1440])

        for (const sc of SCREENS) {
            for (const w of widths) {
                await page.setViewportSize({ width: w, height: 900 })
                await page.goto(BASE + sc.path, { waitUntil: 'domcontentloaded' })
                // A fixed 1.1s guess produced garbage: data-heavy screens were still loading, so the
                // same page reported 2 buttons at one width and 28 at the next. That looked like a
                // responsive bug and was purely a race. Wait for content to actually appear, then settle.
                await page.waitForFunction(
                    () => Array.from(document.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0).length > 2,
                    undefined, { timeout: 15_000 },
                ).catch(() => {})
                await page.waitForTimeout(1800)
                // NEVER swallow this silently: a swallowed error here reads as "0 controls found",
                // which looks like a finding about the product instead of a bug in the harness.
                let got: Ctrl[] = []
                try { got = await measure(page, sc.name, shell, w) }
                catch (e) { console.error(`  !! ĐO THẤT BẠI ${shell} ${w}px ${sc.name}: ${String(e).split('\n')[0].slice(0, 160)}`) }
                rows.push(...got)

                // Layout-level facts: horizontal overflow is the classic responsive break.
                const l = await page.evaluate(() => ({
                    scrollW: document.documentElement.scrollWidth,
                    clientW: document.documentElement.clientWidth,
                    navCount: document.querySelectorAll('nav a, aside a').length,
                    btnCount: Array.from(document.querySelectorAll('button')).filter((b) => b.getBoundingClientRect().width > 0).length,
                })).catch(() => null)
                if (l) layout.push({ screen: sc.name, shell, viewport: w, ...l, overflow: l.scrollW > l.clientW })
                console.log(`  ${shell.padEnd(7)} ${String(w).padStart(5)}px  ${sc.name.padEnd(20)} ${got.length} control${l?.overflow ? '  ⚠ TRÀN NGANG' : ''}`)
            }
        }
        if (shell === 'desktop') {
            await page.setViewportSize({ width: 1440, height: 900 })
            await page.goto(BASE + SCREENS[0].path, { waitUntil: 'domcontentloaded' })
            await page.waitForTimeout(1000)
            console.log(`  vòng focus bàn phím: ${(await focusRing(page)) ? 'CÓ' : 'KHÔNG THẤY'}`)
        }
        await ctx.close()
    }
    await browser.close()

    writeFileSync(join(OUT, 'measure-controls.json'), JSON.stringify({ controls: rows, layout }, null, 2))
    console.log(`\nĐã ghi ${rows.length} phép đo + ${layout.length} mốc bố cục -> measure-controls.json`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
