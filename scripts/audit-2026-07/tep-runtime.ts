/**
 * PHASE 4 — runtime pass on Tệp, aimed at the HARDEST real cases found in the data:
 *   · the densest folder (27 videos, at depth 3 → 4 clicks deep)
 *   · a video whose processing FAILED (2 exist) — what does the user actually see?
 *   · the deepest breadcrumb — does it survive?
 *   · the same folder as owner / admin / staff — which actions each role really gets
 *
 * READ-ONLY: navigation and reading only. No clicks that write.
 */
import { PrismaClient } from '@prisma/client'
import { chromium, type Page } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const OUT = process.env.AUDIT_OUT_DIR!
const s = JSON.parse(readFileSync(join(OUT, 'audit-sessions.json'), 'utf8'))
const url = readFileSync(join(process.cwd(), '.env.local'), 'utf8').match(/^DATABASE_URL\s*=\s*(.*)$/m)![1].trim().replace(/^["']|["']$/g, '')
if (!url.includes('round-lab')) { console.error('DỪNG: không phải nhánh thử nghiệm.'); process.exit(1) }
const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] })

async function snapshot(page: Page) {
    return await page.evaluate(() => {
        const vis = (e: Element) => e.getBoundingClientRect().width > 0
        const txt = (e: Element) => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
        const overflowing = Array.from(document.querySelectorAll('*')).filter((e) => {
            const el = e as HTMLElement
            return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 60 && vis(e)
        }).length
        return {
            h1: txt(document.querySelector('h1') || document.createElement('i')),
            buttons: [...new Set(Array.from(document.querySelectorAll('button')).filter(vis).map(txt).filter((t) => t && t.length < 34))],
            cards: document.querySelectorAll('[class*="card"], [class*="Card"], article').length,
            breadcrumbText: txt(document.querySelector('nav[aria-label*="readcrumb"], [class*="breadcrumb" i]') || document.createElement('i')).slice(0, 120),
            clippedElements: overflowing,
            bodyChars: (document.body.innerText || '').length,
            pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        }
    })
}

async function main() {
    // Pick the real worst cases straight out of the data.
    const dense = await db.$queryRaw<{ id: string; name: string; depth: number; n: bigint }[]>`
        SELECT f.id, f.name, f.depth, (SELECT COUNT(*) FROM "ReviewAsset" a WHERE a."folderId"=f.id AND a."deletedAt" IS NULL) AS n
        FROM "ReviewFolder" f WHERE f."deletedAt" IS NULL
        ORDER BY n DESC LIMIT 1`
    const failed = await db.$queryRaw<{ assetId: string; name: string }[]>`
        SELECT a.id AS "assetId", a.name FROM "ReviewVersion" v
        JOIN "ReviewAsset" a ON a.id = v."assetId"
        WHERE v."pipelineStatus"::text = 'FAILED' AND a."deletedAt" IS NULL LIMIT 1`
    const deepest = await db.$queryRaw<{ id: string; name: string; depth: number }[]>`
        SELECT id, name, depth FROM "ReviewFolder" WHERE "deletedAt" IS NULL ORDER BY depth DESC LIMIT 1`
    await db.$disconnect()

    console.log(`Thư mục dày nhất : "${dense[0].name}" — ${dense[0].n} video, cấp ${dense[0].depth}`)
    console.log(`Thư mục sâu nhất : "${deepest[0].name}" — cấp ${deepest[0].depth}`)
    console.log(`Video xử lý HỎNG : ${failed.length ? `"${failed[0].name}"` : '(không tìm thấy video sống nào hỏng)'}\n`)

    const browser = await chromium.launch()
    const report: Record<string, unknown>[] = []

    for (const role of ['owner', 'admin', 'staff'] as const) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        await ctx.addInitScript({ content: 'globalThis.__name = globalThis.__name || function (f) { return f }' })
        await ctx.addCookies([
            { name: 'session', value: s.roles[role].cookie, domain: 'localhost', path: '/' },
            { name: 'view-mode', value: 'desktop', domain: 'localhost', path: '/' },
        ])
        const page = await ctx.newPage()
        console.log(`=== ${s.roles[role].label} ===`)

        const targets = [
            { url: `/${s.workspaceId}/team`, name: 'Gốc Tệp' },
            { url: `/${s.workspaceId}/team/folder/${dense[0].id}`, name: `Thư mục dày (${dense[0].n} video)` },
            { url: `/${s.workspaceId}/team/folder/${deepest[0].id}`, name: `Thư mục sâu (cấp ${deepest[0].depth})` },
            ...(failed.length ? [{ url: `/${s.workspaceId}/team/asset/${failed[0].assetId}`, name: 'Video xử lý HỎNG' }] : []),
        ]
        for (const t of targets) {
            const resp = await page.goto(`http://localhost:3000${t.url}`, { waitUntil: 'domcontentloaded' }).catch(() => null)
            await page.waitForFunction(() => (document.body.innerText || '').length > 400, undefined, { timeout: 20_000 }).catch(() => {})
            await page.waitForTimeout(2600)
            const snap = await snapshot(page)
            const finalPath = new URL(page.url()).pathname
            report.push({ role, ...t, status: resp?.status() ?? null, finalPath, ...snap })
            const bounced = finalPath !== t.url
            console.log(`  ${t.name.padEnd(28)} HTTP ${resp?.status() ?? '—'}${bounced ? ` → ĐÁ VỀ ${finalPath}` : ''}`)
            console.log(`      tiêu đề "${snap.h1.slice(0, 40)}" · ${snap.buttons.length} nút · ${snap.clippedElements} phần tử bị cắt chữ · tràn trang: ${snap.pageOverflow ? 'CÓ' : 'không'}`)
            if (role === 'owner') console.log(`      nút: ${snap.buttons.slice(0, 14).join(' · ')}`)
            await page.screenshot({ path: join(OUT, 'shots', `TEP-${role}-${t.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}.png`) })
        }
        await ctx.close()
        console.log('')
    }
    await browser.close()
    writeFileSync(join(OUT, 'tep-runtime.json'), JSON.stringify(report, null, 2))
    console.log(`Đã ghi ${report.length} quan sát -> tep-runtime.json`)
}
main().catch((e) => { console.error(e); process.exitCode = 1 })
