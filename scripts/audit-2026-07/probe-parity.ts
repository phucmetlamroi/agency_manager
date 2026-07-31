/**
 * Environment Parity Probe — audit 2026-07 (Phase 2, gate G1).
 *
 * READ-ONLY. Issues nothing but SELECTs, against both branches, and asserts the
 * TEST branch really is a faithful copy of PRODUCTION before any audit work relies on it.
 *
 *   npx tsx scripts/audit-2026-07/probe-parity.ts
 *
 * Guards, mirroring the repo's existing harness convention (scripts/test-invite-security.ts:58):
 *   - the TEST url must carry the audit branch marker and must NOT carry the production marker
 *   - the PROD url is opened read-only and is never written to
 */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const PROD_MARKER = 'autumn-flower'
const TEST_MARKER = 'round-lab'

function readEnvFile(file: string, key: string): string {
    const raw = readFileSync(join(process.cwd(), file), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
        const m = line.match(new RegExp(`^${key}\\s*=\\s*(.*)$`))
        if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    }
    throw new Error(`${key} không có trong ${file}`)
}

const TEST_URL = readEnvFile('.env.local', 'DATABASE_URL')
const PROD_URL = readEnvFile('.env', 'DATABASE_URL')

// Fail closed, loudly, before a single connection is opened.
if (!TEST_URL.includes(TEST_MARKER) || TEST_URL.includes(PROD_MARKER)) {
    console.error(`DỪNG: .env.local phải trỏ nhánh "${TEST_MARKER}" và tuyệt đối không chứa "${PROD_MARKER}".`)
    process.exit(1)
}
if (!PROD_URL.includes(PROD_MARKER)) {
    console.error(`DỪNG: .env không còn là production ("${PROD_MARKER}") — kiểm tra lại trước khi so sánh.`)
    process.exit(1)
}

const test = new PrismaClient({ datasources: { db: { url: TEST_URL } }, log: ['error'] })
const prod = new PrismaClient({ datasources: { db: { url: PROD_URL } }, log: ['error'] })

type Col = { table_name: string; column_name: string; data_type: string }
type Cnt = { table_name: string; n: bigint }

const columnsOf = (db: PrismaClient) =>
    db.$queryRaw<Col[]>`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, column_name`

/** Live row counts per table, via a single pass over the catalog + dynamic counts. */
async function rowCounts(db: PrismaClient): Promise<Map<string, number>> {
    const tables = await db.$queryRaw<{ table_name: string }[]>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    const out = new Map<string, number>()
    for (const t of tables) {
        // Identifier comes from the catalog, not user input; still quoted defensively.
        const r = await db.$queryRawUnsafe<Cnt[]>(`SELECT '${t.table_name}' AS table_name, COUNT(*)::bigint AS n FROM "${t.table_name}"`)
        out.set(t.table_name, Number(r[0].n))
    }
    return out
}

async function main() {
    console.log('SO SÁNH TƯƠNG ĐỒNG: nhánh thử nghiệm  vs  production (chỉ đọc)\n')

    const [tCols, pCols] = await Promise.all([columnsOf(test), columnsOf(prod)])

    const key = (c: Col) => `${c.table_name}.${c.column_name}`
    const tMap = new Map(tCols.map((c) => [key(c), c.data_type]))
    const pMap = new Map(pCols.map((c) => [key(c), c.data_type]))

    const onlyProd = [...pMap.keys()].filter((k) => !tMap.has(k))
    const onlyTest = [...tMap.keys()].filter((k) => !pMap.has(k))
    const typeDiff = [...pMap.entries()].filter(([k, v]) => tMap.has(k) && tMap.get(k) !== v)

    const tTables = new Set(tCols.map((c) => c.table_name))
    const pTables = new Set(pCols.map((c) => c.table_name))

    console.log('[1] CẤU TRÚC DỮ LIỆU')
    console.log(`  bảng   — production ${pTables.size} · thử nghiệm ${tTables.size}`)
    console.log(`  cột    — production ${pMap.size} · thử nghiệm ${tMap.size}`)
    console.log(`  ${onlyProd.length === 0 && onlyTest.length === 0 && typeDiff.length === 0 ? '✓ TRÙNG KHỚP HOÀN TOÀN' : '✗ CÓ SAI LỆCH'}`)
    if (onlyProd.length) console.log(`  chỉ có ở production (${onlyProd.length}): ${onlyProd.slice(0, 12).join(', ')}${onlyProd.length > 12 ? ' …' : ''}`)
    if (onlyTest.length) console.log(`  chỉ có ở thử nghiệm (${onlyTest.length}): ${onlyTest.slice(0, 12).join(', ')}${onlyTest.length > 12 ? ' …' : ''}`)
    if (typeDiff.length) console.log(`  khác kiểu dữ liệu (${typeDiff.length}): ${typeDiff.slice(0, 8).map(([k, v]) => `${k} prod=${v} test=${tMap.get(k)}`).join(' | ')}`)

    console.log('\n[2] KHỐI LƯỢNG DỮ LIỆU — nhánh có phải bản sao thật không')
    const [tCnt, pCnt] = await Promise.all([rowCounts(test), rowCounts(prod)])
    const WATCH = ['Profile', 'Workspace', 'User', 'Task', 'Client', 'ReviewFolder', 'ReviewAsset', 'ReviewVersion', 'ReviewComment', 'TaskComment', 'Invoice', 'ShareLink', 'ClientShareLink', 'AuditLog']
    let drift = 0
    for (const t of WATCH) {
        if (!pCnt.has(t)) { console.log(`  ${t.padEnd(17)} — KHÔNG CÓ BẢNG NÀY`); continue }
        const p = pCnt.get(t)!, s = tCnt.get(t) ?? -1
        const same = p === s
        if (!same) drift++
        console.log(`  ${t.padEnd(17)} prod ${String(p).padStart(6)} · test ${String(s).padStart(6)}  ${same ? '✓' : '≠ lệch ' + (s - p)}`)
    }

    const totalProd = [...pCnt.values()].reduce((a, b) => a + b, 0)
    const totalTest = [...tCnt.values()].reduce((a, b) => a + b, 0)
    console.log(`\n  tổng số dòng — production ${totalProd} · thử nghiệm ${totalTest}`)
    console.log(`  ${totalTest === 0 ? '✗ NHÁNH RỖNG — không phải bản sao' : drift === 0 ? '✓ Bản sao khớp từng bảng' : `⚠ Bản sao có dữ liệu nhưng lệch ở ${drift} bảng (nhánh tạo trước khi prod thay đổi tiếp)`}`)

    console.log('\n[3] MỐC AN TOÀN')
    console.log(`  production đọc  : ${PROD_URL.match(/ep-[a-z0-9-]+/)?.[0]}`)
    console.log(`  thử nghiệm dùng : ${TEST_URL.match(/ep-[a-z0-9-]+/)?.[0]}`)
    console.log('  ✓ Không câu lệnh ghi nào được phát ra trong lần chạy này.')
}

main()
    .catch((e) => { console.error(e); process.exitCode = 1 })
    .finally(async () => { await test.$disconnect(); await prod.$disconnect() })
