/**
 * [Review module P0 — DoD FINAL] End-to-end verification against PRODUCTION
 * after the branch merged to main. Proves the whole P0 pipeline with a REAL
 * Mux asset (23s demo video, video_quality=basic, deleted afterwards):
 *
 *   0. Prod deploy live (route /api/webhooks/mux exists).
 *   1. /r/bat-ky → 404, NOT a login redirect (public middleware branch).
 *   2. PUT /api/inngest → app sync with Inngest Cloud.
 *   3. Cron janitor: no auth → 401; Bearer CRON_SECRET → 200 {success:true}.
 *   4. Create Mux test asset → Mux fires real webhooks at prod.
 *   5. Poll prod DB: WebhookEvent rows appear AND processedAt gets set
 *      (webhook → HMAC → ledger → Inngest event → function ran → claimed).
 *   6. Replay a ledgered event id with a VALID signature → 200 duplicated:true,
 *      row count unchanged. Bad signature → 401 (fail closed).
 *   7. Cleanup: delete the Mux asset.
 *
 * DB access is read-only except what production itself writes. Run:
 *   npx tsx scripts/probe-review-p0-dod.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createHmac } from 'crypto'
import { PrismaClient } from '@prisma/client'

const BASE = 'https://hustlytasker.xyz'
const TEST_INPUT_URL = 'https://storage.googleapis.com/muxdemofiles/mux-video-intro.mp4'

try {
    const env = readFileSync(join(process.cwd(), '.env'), 'utf8')
    for (const line of env.split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
    }
} catch { /* ignore */ }

let ok = 0, fail = 0
const check = (name: string, cond: boolean, extra = '') => {
    (cond ? ok++ : fail++)
    console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const prisma = new PrismaClient()
const muxAuth = 'Basic ' + Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString('base64')

async function main() {
    console.log('=== P0 DoD — production end-to-end ===\n')

    // ── 0. Deploy live? ───────────────────────────────────────────
    console.log('[0] Prod deploy')
    let live = false
    for (let i = 0; i < 40; i++) { // up to ~10 min
        const r = await fetch(`${BASE}/api/webhooks/mux`, { method: 'GET' }).catch(() => null)
        if (r && r.status !== 404) { live = true; check('route /api/webhooks/mux deployed', true, `GET → ${r.status}`); break }
        if (i === 0) console.log('  … waiting for Vercel deploy (poll 15s)')
        await sleep(15000)
    }
    if (!live) { check('route /api/webhooks/mux deployed', false, 'still 404 after 10 min'); return finish() }

    // ── 1. /r/[slug] public 404 ───────────────────────────────────
    console.log('\n[1] /r/bat-ky on prod')
    const r1 = await fetch(`${BASE}/r/bat-ky`, { redirect: 'manual' })
    check('status 404 (not a redirect)', r1.status === 404, `HTTP ${r1.status}`)
    check('x-robots-tag noindex', (r1.headers.get('x-robots-tag') || '').includes('noindex'))

    // ── 2. Inngest app sync ───────────────────────────────────────
    console.log('\n[2] Inngest app sync (PUT /api/inngest)')
    const r2 = await fetch(`${BASE}/api/inngest`, { method: 'PUT' })
    const sync = await r2.json().catch(() => ({}))
    check('PUT /api/inngest → 200', r2.ok, `HTTP ${r2.status} ${JSON.stringify(sync).slice(0, 140)}`)

    // ── 3. Cron janitor ───────────────────────────────────────────
    console.log('\n[3] Cron janitor')
    const noAuth = await fetch(`${BASE}/api/cron/review-janitor`)
    check('no auth → 401', noAuth.status === 401, `HTTP ${noAuth.status}`)
    const withAuth = await fetch(`${BASE}/api/cron/review-janitor`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    const cronBody = await withAuth.json().catch(() => ({}))
    check('Bearer CRON_SECRET → 200 success', withAuth.status === 200 && cronBody.success === true,
        `HTTP ${withAuth.status} ${JSON.stringify(cronBody)}`)

    // ── 4. Real Mux asset → webhooks fire at prod ─────────────────
    console.log('\n[4] Mux test asset (basic quality, deleted after)')
    const createRes = await fetch('https://api.mux.com/video/v1/assets', {
        method: 'POST',
        headers: { Authorization: muxAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: [{ url: TEST_INPUT_URL }],
            playback_policy: ['signed'],
            video_quality: 'basic',
            passthrough: 'p0-dod-test',
        }),
    })
    const created = await createRes.json().catch(() => ({})) as { data?: { id?: string } }
    const assetId = created.data?.id
    check('asset created', createRes.ok && Boolean(assetId), assetId || `HTTP ${createRes.status}`)

    // ── 5. Ledger rows + Inngest processing ───────────────────────
    console.log('\n[5] WebhookEvent ledger on prod DB (poll up to 5 min)')
    let readyRow: { id: string; type: string; processedAt: Date | null } | null = null
    let anyRows = 0
    if (assetId) {
        for (let i = 0; i < 30; i++) {
            const rows = await prisma.webhookEvent.findMany({
                where: { provider: 'mux' },
                orderBy: { receivedAt: 'desc' },
                take: 10,
                select: { id: true, type: true, processedAt: true, payload: true },
            })
            anyRows = rows.length
            const mine = rows.filter(r => JSON.stringify(r.payload).includes(assetId))
            readyRow = mine.find(r => r.type === 'video.asset.ready') ?? null
            if (readyRow && readyRow.processedAt) break
            await sleep(10000)
        }
    }
    check('webhook rows ledgered', anyRows > 0, `${anyRows} recent mux row(s)`)
    check('video.asset.ready row exists (HMAC verified end-to-end)', Boolean(readyRow), readyRow?.id || '')
    check('processedAt set → Inngest function RAN + claimed', Boolean(readyRow?.processedAt),
        readyRow?.processedAt ? new Date(readyRow.processedAt).toISOString() : 'still null')

    // ── 6. Replay protection + bad signature ─────────────────────
    console.log('\n[6] Replay + signature fail-closed')
    if (readyRow) {
        const before = await prisma.webhookEvent.count({ where: { provider: 'mux' } })
        const body = JSON.stringify({ type: readyRow.type, id: readyRow.id, data: { note: 'replay' } })
        const t = Math.floor(Date.now() / 1000)
        const v1 = createHmac('sha256', process.env.MUX_WEBHOOK_SECRET || '').update(`${t}.${body}`).digest('hex')
        const replay = await fetch(`${BASE}/api/webhooks/mux`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Mux-Signature': `t=${t},v1=${v1}` },
            body,
        })
        const replayJson = await replay.json().catch(() => ({}))
        const after = await prisma.webhookEvent.count({ where: { provider: 'mux' } })
        check('valid-signature replay → 200 duplicated:true', replay.status === 200 && replayJson.duplicated === true,
            JSON.stringify(replayJson))
        check('row count unchanged after replay', before === after, `${before} → ${after}`)

        const bad = await fetch(`${BASE}/api/webhooks/mux`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Mux-Signature': `t=${t},v1=${'0'.repeat(64)}` },
            body,
        })
        check('bad signature → 401 fail-closed', bad.status === 401, `HTTP ${bad.status}`)
    } else {
        check('replay tests', false, 'skipped — no ready row')
    }

    // ── 7. Cleanup ────────────────────────────────────────────────
    console.log('\n[7] Cleanup')
    if (assetId) {
        const del = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
            method: 'DELETE', headers: { Authorization: muxAuth },
        })
        check('test asset deleted from Mux', del.status === 204, `HTTP ${del.status}`)
    }

    await finish()
}

async function finish() {
    await prisma.$disconnect()
    console.log(`\nRESULT: ${ok} passed, ${fail} failed`)
    process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
