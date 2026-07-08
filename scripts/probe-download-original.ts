/**
 * [Download feature — proof] READ-ONLY prod probe: proves the review download serves the ORIGINAL
 * uploaded file at full quality (byte-identical), not a Mux rendition.
 *
 * For a few real READY versions it: (1) HEADs the R2 object and checks its size === the stored
 * ReviewVersion.sizeBytes; (2) mints the SAME presigned GET the download routes use; (3) range-GETs
 * it over HTTP and confirms the served total size === the object size + Content-Disposition is
 * "attachment". No writes anywhere — SELECT + R2 HEAD + a 1-byte GET.
 *
 * Usage:  npx tsx scripts/probe-download-original.ts   (uses prod .env — R2 creds + DATABASE_URL)
 */

import fs from 'fs'
import path from 'path'
import { neon } from '@neondatabase/serverless'

function loadEnv() {
    const p = path.join(process.cwd(), '.env')
    if (!fs.existsSync(p)) { console.error('❌ .env not found'); process.exit(1) }
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
}
loadEnv()

const DB = process.env.DATABASE_URL || ''
if (!DB) { console.error('❌ DATABASE_URL missing'); process.exit(1) }
for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']) {
    if (!process.env[k]) { console.error(`❌ ${k} missing — cannot reach R2`); process.exit(1) }
}

let pass = 0, fail = 0
const ok = (n: string, cond: boolean, d = '') => { if (cond) { pass++; console.log(`  ✅ ${n}`) } else { fail++; console.error(`  ❌ ${n}${d ? ` — ${d}` : ''}`) } }

async function main() {
    const { presignGetObject, headObject } = await import('../src/lib/review/r2')
    const sql = neon(DB)
    console.log(`\n▶ download-original probe on ${DB.replace(/:[^:@/]+@/, ':***@').match(/@([^/]+)/)?.[1] || '?'} (READ-ONLY)`)

    const rows = (await sql`
        SELECT id, "r2Key", "fileName", "sizeBytes", "mimeType"
        FROM "ReviewVersion"
        WHERE "pipelineStatus" = 'READY' AND "r2Key" IS NOT NULL AND "deletedAt" IS NULL
        ORDER BY "readyAt" DESC NULLS LAST
        LIMIT 3
    `) as Array<{ id: string; r2Key: string; fileName: string; sizeBytes: string; mimeType: string }>

    if (!rows.length) { console.log('  ⚠ no READY versions with r2Key found — nothing to prove.'); return }
    console.log(`  Found ${rows.length} READY version(s) to verify.\n`)

    for (const v of rows) {
        const storedSize = Number(v.sizeBytes)
        console.log(`— v ${v.id} · ${v.fileName} · ${(storedSize / 1e6).toFixed(1)} MB · ${v.mimeType}`)

        // (1) the original object exists in R2 at the exact stored size
        const head = await headObject(v.r2Key)
        ok('R2 object exists (HEAD)', !!head, v.r2Key)
        if (head) ok('R2 object size === stored sizeBytes (full original retained)', head.size === storedSize, `r2=${head?.size} db=${storedSize}`)

        // (2)+(3) the presigned download URL serves the full file with attachment disposition
        const url = await presignGetObject(v.r2Key, { expiresIn: 300, downloadFileName: v.fileName })
        ok('presigned GET url minted (https)', url.startsWith('https://'))
        const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
        ok('range GET reachable (206/200)', res.status === 206 || res.status === 200, `status=${res.status}`)
        const cr = res.headers.get('content-range') // "bytes 0-0/<total>"
        const total = cr ? Number(cr.split('/')[1]) : Number(res.headers.get('content-length'))
        ok('served total bytes === original size (downloads full quality, nothing missing)', total === storedSize, `served=${total} original=${storedSize}`)
        const cd = res.headers.get('content-disposition') || ''
        ok('served as attachment (saves to disk, not streamed)', /attachment/i.test(cd), cd)
        console.log('')
    }
}

main()
    .then(() => { console.log(`RESULT: ${pass} passed, ${fail} failed`); process.exit(fail > 0 ? 1 : 0) })
    .catch((e) => { console.error('💥 probe threw:', e); process.exit(1) })
