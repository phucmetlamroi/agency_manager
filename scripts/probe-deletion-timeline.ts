/**
 * READ-ONLY forensic timeline for the Hustly June workspace deletion.
 * Narrows WHEN it happened + dumps every audit action in the window + measures
 * the full blast radius (other tables orphaned by the same workspace delete).
 * Zero writes.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Deletion timeline forensic (READ-ONLY) ===\n')

    // 1. Orphan tasks updatedAt distribution (last app-write per task).
    const upd = await prisma.$queryRawUnsafe<any[]>(
        `SELECT to_char("updatedAt", 'YYYY-MM-DD HH24:00') AS hr, COUNT(*)::int AS n
         FROM "Task" WHERE "workspaceId" IS NULL
         GROUP BY hr ORDER BY hr DESC LIMIT 20`
    )
    console.log('--- 1. Orphan tasks by updatedAt hour (most recent first) ---')
    for (const r of upd) console.log(`  ${r.hr}: ${r.n}`)
    console.log('')

    // 2. FULL AuditLog dump in the suspected window (28 Jun 12:00 .. 29 Jun 08:00 UTC).
    const win = await prisma.$queryRawUnsafe<any[]>(
        `SELECT "createdAt", action, "actorUserId", "targetId", "workspaceId"
         FROM "AuditLog"
         WHERE "createdAt" >= '2026-06-28T12:00:00Z' AND "createdAt" <= '2026-06-29T08:00:00Z'
         ORDER BY "createdAt"`
    )
    console.log(`--- 2. ALL audit actions 28-Jun 12:00 .. 29-Jun 08:00 UTC: ${win.length} ---`)
    for (const a of win) {
        console.log(`  ${new Date(a.createdAt).toISOString()} [${a.action}] actor=${a.actorUserId?.slice(0,8) ?? 'SYSTEM'} target=${a.targetId?.slice(0,8) ?? '-'} ws=${a.workspaceId?.slice(0,8) ?? '-'}`)
    }
    console.log('')

    // 3. Blast radius — rows in OTHER tables pointing at a workspaceId that no longer exists.
    const tables = ['Invoice', 'Project', 'Rating', 'Client', 'GeoSession']
    console.log('--- 3. Blast radius: rows orphaned by a deleted workspace (workspaceId not in Workspace) ---')
    for (const t of tables) {
        try {
            const r = await prisma.$queryRawUnsafe<any[]>(
                `SELECT COUNT(*)::int AS n FROM "${t}" x
                 LEFT JOIN "Workspace" w ON x."workspaceId" = w.id
                 WHERE x."workspaceId" IS NOT NULL AND w.id IS NULL`
            )
            console.log(`  ${t}: ${r[0].n} orphaned row(s)`)
        } catch (e: any) {
            console.log(`  ${t}: (no workspaceId column or error: ${e.message?.slice(0,50)})`)
        }
    }
    console.log('')

    // 4. The newest task that STILL belongs to the recovered June ws (sanity).
    const recovered = await prisma.$queryRawUnsafe<any[]>(
        `SELECT MIN("createdAt") AS first, MAX("createdAt") AS last, COUNT(*)::int AS n
         FROM "Task" WHERE "workspaceId" = (SELECT id FROM "Workspace" WHERE name='Tháng 6/2026' AND "profileId"='61f25775-eb95-4ece-96e8-99ae97542af1' LIMIT 1)`
    )
    console.log('--- 4. Recovered June workspace task span (sanity) ---')
    console.log(`  tasks=${recovered[0].n} first=${recovered[0].first ? new Date(recovered[0].first).toISOString().slice(0,10) : '-'} last=${recovered[0].last ? new Date(recovered[0].last).toISOString().slice(0,10) : '-'}`)

    console.log('\n=== forensic complete (no writes) ===')
}
main().catch(e => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
