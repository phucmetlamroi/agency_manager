/**
 * PHASE 3 — horizontal AS-IS sweep of the default web UI, per role.
 *
 * Drives a real browser (Playwright, already a devDependency) against the local dev server that
 * is pointed at the isolated audit branch. For every role × route it records what the SERVER
 * actually did (status, final URL after redirects) and what the USER actually sees (title, H1,
 * nav items, action buttons, error text) — plus a screenshot as evidence.
 *
 *   npx tsx scripts/audit-2026-07/sweep-routes.ts
 *
 * Mission Control (/mc/**) is deliberately NOT swept — it is out of audit scope.
 */
import { chromium, type BrowserContext } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const BASE = 'http://localhost:3000'
const OUT = process.env.AUDIT_OUT_DIR
if (!OUT) throw new Error('Thiếu AUDIT_OUT_DIR')
const SHOTS = join(OUT, 'shots')
mkdirSync(SHOTS, { recursive: true })

const sessions = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8')) as {
    workspaceId: string
    roles: Record<string, { cookie: string; label: string; username: string }>
}
const WS = sessions.workspaceId

/** The default web UI. Everything under /mc/** is excluded by scope. */
const ROUTES: { path: string; group: string; name: string }[] = [
    { path: `/${WS}`, group: 'Vào hệ thống', name: 'Gốc workspace (chuyển hướng)' },
    { path: `/${WS}/dashboard`, group: 'Nhân sự', name: 'Bảng điều khiển' },
    { path: `/${WS}/dashboard/tasks`, group: 'Nhân sự', name: 'Task của tôi' },
    { path: `/${WS}/dashboard/salary`, group: 'Nhân sự', name: 'Lương của tôi' },
    { path: `/${WS}/dashboard/schedule`, group: 'Nhân sự', name: 'Lịch của tôi' },
    { path: `/${WS}/dashboard/profile`, group: 'Nhân sự', name: 'Hồ sơ cá nhân' },
    { path: `/${WS}/dashboard/errors`, group: 'Nhân sự', name: 'Lỗi bị ghi nhận' },
    { path: `/${WS}/admin`, group: 'Quản trị', name: 'Tổng quan quản trị' },
    { path: `/${WS}/admin/queue`, group: 'Quản trị', name: 'Kho task đợi' },
    { path: `/${WS}/admin/requests`, group: 'Quản trị', name: 'Hộp thư yêu cầu khách' },
    { path: `/${WS}/admin/crm`, group: 'Quản trị', name: 'Khách hàng (CRM)' },
    { path: `/${WS}/admin/finance`, group: 'Quản trị', name: 'Tài chính' },
    { path: `/${WS}/admin/payroll`, group: 'Quản trị', name: 'Bảng lương' },
    { path: `/${WS}/admin/analytics`, group: 'Quản trị', name: 'Phân tích' },
    { path: `/${WS}/admin/members`, group: 'Quản trị', name: 'Thành viên workspace' },
    { path: `/${WS}/admin/profile-members`, group: 'Quản trị', name: 'Thành viên tổ chức' },
    { path: `/${WS}/admin/schedule`, group: 'Quản trị', name: 'Lịch & khả dụng' },
    { path: `/${WS}/admin/settings`, group: 'Quản trị', name: 'Cài đặt' },
    { path: `/${WS}/admin/audit-log`, group: 'Quản trị', name: 'Nhật ký hoạt động' },
    { path: `/${WS}/admin/cancelled`, group: 'Quản trị', name: 'Task đã huỷ' },
    { path: `/${WS}/admin/client-trash`, group: 'Quản trị', name: 'Thùng rác khách hàng' },
    { path: `/${WS}/admin/profile-trash`, group: 'Quản trị', name: 'Thùng rác tổ chức' },
    { path: `/${WS}/admin/menu`, group: 'Quản trị', name: 'Menu quản trị' },
    { path: `/${WS}/team`, group: 'Tệp (Review)', name: 'Trình duyệt Tệp' },
    { path: `/${WS}/team/shares`, group: 'Tệp (Review)', name: 'Link đã chia sẻ' },
    { path: `/${WS}/team/trash`, group: 'Tệp (Review)', name: 'Thùng rác Tệp' },
]

type Row = {
    role: string; roleLabel: string; path: string; group: string; name: string
    status: number | null; finalPath: string; redirected: boolean
    title: string; h1: string; navItems: string[]; buttons: string[]
    consoleErrors: string[]; visibleError: string | null; shot: string
}

async function sweepRole(ctx: BrowserContext, roleKey: string, roleLabel: string): Promise<Row[]> {
    const page = await ctx.newPage()
    const rows: Row[] = []
    for (const r of ROUTES) {
        const consoleErrors: string[] = []
        const onErr = (m: { type: () => string; text: () => string }) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)) }
        page.on('console', onErr as never)
        let status: number | null = null
        try {
            const resp = await page.goto(BASE + r.path, { waitUntil: 'domcontentloaded', timeout: 45_000 })
            status = resp?.status() ?? null
            await page.waitForTimeout(900) // let client components settle
        } catch {
            status = null
        }
        const finalPath = new URL(page.url()).pathname
        const shot = `${roleKey}__${r.path.replace(/[^a-z0-9]+/gi, '_').slice(-60)}.png`
        try { await page.screenshot({ path: join(SHOTS, shot), fullPage: false }) } catch { /* ignore */ }

        // NOTE: `networkidle` never settles here — the CSP-blocked Supabase realtime socket retries
        // forever (finding F-01), so waiting on it just burns the timeout. Locators are used instead
        // of a single page.evaluate: they auto-retry against a live DOM and survive the client-side
        // navigations this app performs after mount. Any failure below is a HARNESS artefact and is
        // recorded verbatim — never reported as a broken screen.
        const read = async () => await page.evaluate(() => {
            const txt = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
            const uniq = (a: string[]) => [...new Set(a.filter(Boolean))]
            return {
                title: document.title,
                h1: txt(document.querySelector('h1')),
                navItems: uniq(Array.from(document.querySelectorAll('nav a, aside a')).map((a) => txt(a))).slice(0, 40),
                buttons: uniq(Array.from(document.querySelectorAll('button')).map((b) => txt(b)).filter((t) => t.length > 0 && t.length < 40)).slice(0, 40),
                visibleError: (() => {
                    const body = document.body.innerText || ''
                    for (const p of ['Không có quyền', 'Bạn không có quyền', 'Truy cập bị từ chối', 'Forbidden', 'Unauthorized', 'Application error', '404', 'Không tìm thấy']) {
                        if (body.includes(p)) return p
                    }
                    return null
                })(),
            }
        })
        let data = { title: '', h1: '', navItems: [] as string[], buttons: [] as string[], visibleError: null as string | null }
        let readErr = ''
        for (let attempt = 0; attempt < 3; attempt++) {
            try { data = await read(); readErr = ''; break } catch (e) { readErr = String(e).split('\n')[0].slice(0, 160); await page.waitForTimeout(1500) }
        }
        if (readErr) {
            // Fall back to locators, which retry against the live DOM instead of snapshotting it once.
            const safe = async <T>(fn: () => Promise<T>, dflt: T): Promise<T> => { try { return await fn() } catch { return dflt } }
            data = {
                title: await safe(() => page.title(), ''),
                h1: await safe(() => page.locator('h1').first().innerText({ timeout: 4000 }), ''),
                navItems: (await safe(() => page.locator('nav a, aside a').allInnerTexts(), [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 40),
                buttons: (await safe(() => page.locator('button').allInnerTexts(), [])).map((t) => t.replace(/\s+/g, ' ').trim()).filter((t) => t && t.length < 40).slice(0, 40),
                visibleError: data.title || (await safe(() => page.locator('body').innerText({ timeout: 4000 }), '')) ? null : `KHÔNG ĐỌC ĐƯỢC (${readErr})`,
            }
        }

        page.off('console', onErr as never)
        rows.push({
            role: roleKey, roleLabel, path: r.path, group: r.group, name: r.name,
            status, finalPath, redirected: finalPath !== r.path,
            ...data, consoleErrors, shot,
        })
        const flag = status !== 200 ? `HTTP ${status}` : finalPath !== r.path ? `→ ${finalPath}` : data.visibleError ? `[${data.visibleError}]` : 'ok'
        console.log(`  ${roleKey.padEnd(6)} ${r.name.padEnd(26)} ${flag}`)
    }
    await page.close()
    return rows
}

async function main() {
    const browser = await chromium.launch()
    const all: Row[] = []
    for (const [key, meta] of Object.entries(sessions.roles)) {
        console.log(`\n=== ${meta.label} (${key}) ===`)
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        await ctx.addCookies([{ name: 'session', value: meta.cookie, domain: 'localhost', path: '/' }])
        all.push(...(await sweepRole(ctx, key, meta.label)))
        await ctx.close()
    }
    // A no-session pass: what does a logged-out visitor actually get on protected routes?
    console.log('\n=== Chưa đăng nhập ===')
    const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    all.push(...(await sweepRole(anon, 'anon', 'Chưa đăng nhập')))
    await anon.close()
    await browser.close()

    writeFileSync(join(OUT!, 'sweep-routes.json'), JSON.stringify(all, null, 2))
    console.log(`\nĐã ghi ${all.length} kết quả -> ${join(OUT!, 'sweep-routes.json')}`)
    console.log(`Ảnh chụp -> ${SHOTS}`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
