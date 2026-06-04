/**
 * "Hiện tại đã có profile mới nào đang hoạt động chưa?"
 * Dùng Neon HTTP serverless driver (wake compute reliably) + raw SQL. Read-only.
 */
import { readFileSync } from 'fs'
import { neon } from '@neondatabase/serverless'

function getDatabaseUrl(): string {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL
    const txt = readFileSync('.env', 'utf8')
    const m = txt.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m)
    if (!m) throw new Error('DATABASE_URL not found in .env')
    return m[1].trim()
}

async function main() {
    const sql = neon(getDatabaseUrl())

    const [counts] = (await sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
               count(*) FILTER (WHERE status <> 'ACTIVE')::int AS not_active
        FROM "Profile"
    `) as any[]
    console.log(`Tổng profile: ${counts.total}  |  ACTIVE: ${counts.active}  |  không-ACTIVE: ${counts.not_active}\n`)

    const newest = (await sql`
        SELECT p.id, p.name, p.status, p."createdAt",
               (SELECT count(*) FROM "Workspace" w WHERE w."profileId" = p.id)::int AS ws,
               (SELECT count(*) FROM "User" u WHERE u."profileId" = p.id)::int AS users
        FROM "Profile" p
        ORDER BY p."createdAt" DESC
        LIMIT 15
    `) as any[]
    console.log('=== 15 profile mới nhất (mới → cũ) ===')
    for (const p of newest) {
        const d = new Date(p.createdAt)
        const isNew = Date.now() - d.getTime() < 30 * 24 * 3600 * 1000
        console.log(
            `${d.toISOString().slice(0, 10)}  [${p.status}]  "${p.name}"  ws:${p.ws} users:${p.users}${isNew ? '  ← TẠO TRONG 30 NGÀY' : ''}`,
        )
    }

    const recentWs = (await sql`
        SELECT w.name, w."createdAt", pr.name AS profile
        FROM "Workspace" w LEFT JOIN "Profile" pr ON pr.id = w."profileId"
        WHERE w."createdAt" >= now() - interval '30 days'
        ORDER BY w."createdAt" DESC
        LIMIT 30
    `) as any[]
    console.log(`\n=== Workspace tạo trong 30 ngày qua: ${recentWs.length} ===`)
    for (const w of recentWs) {
        console.log(`  ${new Date(w.createdAt).toISOString().slice(0, 10)}  "${w.name}"  (profile: ${w.profile ?? '—'})`)
    }

    const [act] = (await sql`
        SELECT (SELECT count(*) FROM "Task" WHERE "createdAt" >= now() - interval '30 days')::int AS tasks,
               (SELECT count(*) FROM "User" WHERE "createdAt" >= now() - interval '30 days')::int AS users
    `) as any[]
    console.log(`\nTask tạo trong 30 ngày qua: ${act.tasks}`)
    console.log(`User (tài khoản) tạo trong 30 ngày qua: ${act.users}`)
}

main().catch((e) => {
    console.error('PROBE ERROR:', e?.message ?? e)
    process.exit(1)
})
