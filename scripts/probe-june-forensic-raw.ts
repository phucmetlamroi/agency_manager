/**
 * READ-ONLY raw-SQL forensic for "Hustly Tháng 6/2026 existed last night, gone this
 * morning". Uses $queryRawUnsafe SELECTs ONLY — zero writes. Bypasses Prisma's
 * model assumptions (status enum, soft-delete) to see the literal table contents.
 *
 * Hunts for: (a) any June workspace in ANY state/profile; (b) ORPHAN tasks pointing
 * at a workspaceId that no longer exists (the ghost of a hard-deleted workspace);
 * (c) DB recency — is this DB current, or has it been rolled back (restore/branch)?
 *
 * Usage: npx tsx scripts/probe-june-forensic-raw.ts
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const host = (u?: string) => (u ?? '').match(/@([^/:?]+)/)?.[1] ?? '(unset)'

async function main() {
    console.log('=== June FORENSIC raw-SQL probe (READ-ONLY) ===')
    console.log(`DB host: ${host(process.env.DATABASE_URL)}   Now: ${new Date().toISOString()}\n`)

    // 0. Distinct workspace statuses present (catch ARCHIVED/HIDDEN/etc).
    const statuses = await prisma.$queryRawUnsafe<any[]>(`SELECT status, COUNT(*)::int AS n FROM "Workspace" GROUP BY status ORDER BY n DESC`)
    console.log('--- 0. Workspace.status values present ---')
    for (const s of statuses) console.log(`  status=${s.status}  count=${s.n}`)
    console.log('')

    // 1. RAW dump of EVERY workspace (all profiles, all statuses) — eyeball for June.
    const all = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, "profileId", status, "createdAt", "deletedAt" FROM "Workspace" ORDER BY "createdAt" DESC`
    )
    console.log(`--- 1. RAW Workspace table: ${all.length} rows (newest first) ---`)
    for (const w of all) {
        const june = /6\/2026|tháng\s*6|thang\s*6|june|06\/2026/i.test(w.name) ? ' 🚨JUNE' : ''
        console.log(`  ${new Date(w.createdAt).toISOString().slice(0,10)} [${w.status}] "${w.name}" profile=${(w.profileId??'NULL').slice(0,8)} del=${w.deletedAt? new Date(w.deletedAt).toISOString().slice(0,10):'-'}${june}`)
    }
    console.log('')

    // 2. Workspaces created in June 2026 (any profile/status).
    const june = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, "profileId", status, "createdAt" FROM "Workspace" WHERE "createdAt" >= '2026-06-01' ORDER BY "createdAt"`
    )
    console.log(`--- 2. Workspaces created >= 2026-06-01: ${june.length} ---`)
    for (const w of june) console.log(`  ${new Date(w.createdAt).toISOString().slice(0,19)} [${w.status}] "${w.name}" profile=${(w.profileId??'NULL').slice(0,8)}`)
    console.log('')

    // 3. ORPHAN tasks: workspaceId that does not exist in Workspace (ghost of a deleted ws).
    const orphans = await prisma.$queryRawUnsafe<any[]>(
        `SELECT t."workspaceId", COUNT(*)::int AS n, MIN(t."createdAt") AS first, MAX(t."createdAt") AS last
         FROM "Task" t LEFT JOIN "Workspace" w ON t."workspaceId" = w.id
         WHERE w.id IS NULL GROUP BY t."workspaceId" ORDER BY n DESC`
    )
    console.log(`--- 3. ORPHAN tasks (workspaceId not in Workspace table): ${orphans.length} group(s) ---`)
    if (orphans.length === 0) console.log('  (none — no tasks left behind by a deleted workspace)')
    for (const o of orphans) console.log(`  workspaceId=${o.workspaceId} tasks=${o.n} first=${new Date(o.first).toISOString().slice(0,10)} last=${new Date(o.last).toISOString().slice(0,10)}`)
    console.log('')

    // 4. DB recency — newest row in key tables (detect a rollback/restore to an earlier point).
    const maxima = await prisma.$queryRawUnsafe<any[]>(
        `SELECT 'Workspace' AS tbl, MAX("createdAt") AS newest FROM "Workspace"
         UNION ALL SELECT 'Task', MAX("createdAt") FROM "Task"
         UNION ALL SELECT 'AuditLog', MAX("createdAt") FROM "AuditLog"
         UNION ALL SELECT 'User', MAX("createdAt") FROM "User"`
    )
    console.log('--- 4. DB recency (newest row per table) ---')
    for (const m of maxima) console.log(`  ${m.tbl}: newest=${m.newest ? new Date(m.newest).toISOString() : '-'}`)
    console.log('')

    // 5. AuditLog volume per day, last 4 days (a sudden gap = possible restore window).
    const perDay = await prisma.$queryRawUnsafe<any[]>(
        `SELECT to_char("createdAt", 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
         FROM "AuditLog" WHERE "createdAt" >= now() - interval '4 days'
         GROUP BY day ORDER BY day`
    )
    console.log('--- 5. AuditLog entries per day (last 4 days) ---')
    for (const d of perDay) console.log(`  ${d.day}: ${d.n}`)

    console.log('\n=== forensic complete (no writes performed) ===')
}
main().catch(e => { console.error('forensic error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
