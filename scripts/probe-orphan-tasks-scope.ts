/**
 * READ-ONLY: scope the 119 orphan tasks (workspaceId IS NULL) to confirm they are
 * the Hustly Team "Tháng 6/2026" workspace's tasks, so we can recover them safely.
 * Zero writes.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Orphan-task scope (READ-ONLY) ===\n')

    // Column list of Task (so we reference real columns).
    const cols = await prisma.$queryRawUnsafe<any[]>(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='Task' ORDER BY ordinal_position`
    )
    console.log('--- Task columns ---')
    console.log('  ' + cols.map((c) => c.column_name).join(', '))
    console.log('')

    // Count + date range + content-type spread of orphans.
    const summary = await prisma.$queryRawUnsafe<any[]>(
        `SELECT COUNT(*)::int AS n, MIN("createdAt") AS first, MAX("createdAt") AS last FROM "Task" WHERE "workspaceId" IS NULL`
    )
    console.log('--- Orphan summary ---')
    console.log(`  total=${summary[0].n}  first=${new Date(summary[0].first).toISOString().slice(0,10)}  last=${new Date(summary[0].last).toISOString().slice(0,10)}`)
    console.log('')

    // Orphans per calendar month.
    const byMonth = await prisma.$queryRawUnsafe<any[]>(
        `SELECT to_char("createdAt",'YYYY-MM') AS ym, COUNT(*)::int AS n FROM "Task" WHERE "workspaceId" IS NULL GROUP BY ym ORDER BY ym`
    )
    console.log('--- Orphans per month ---')
    for (const m of byMonth) console.log(`  ${m.ym}: ${m.n}`)
    console.log('')

    // 8 sample orphan rows (full row) to inspect identifying fields.
    const sample = await prisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM "Task" WHERE "workspaceId" IS NULL ORDER BY "createdAt" DESC LIMIT 8`
    )
    console.log('--- 8 sample orphan tasks (newest) ---')
    for (const t of sample) {
        console.log(`  ${new Date(t.createdAt).toISOString().slice(0,10)} status=${t.status} name="${(t.name ?? t.title ?? '').toString().slice(0,40)}" assignee=${(t.assigneeId ?? t.assignedToId ?? t.userId ?? '-')?.toString().slice(0,8)} client=${(t.clientId ?? '-')?.toString().slice(0,8)}`)
    }
    console.log('')

    // Distinct assignees of orphan tasks, joined to User + their Hustly membership.
    const assignees = await prisma.$queryRawUnsafe<any[]>(
        `SELECT u.username, u.email, pa.role AS hustly_role, COUNT(*)::int AS n
         FROM "Task" t
         JOIN "User" u ON u.id = t."assigneeId"
         LEFT JOIN "ProfileAccess" pa ON pa."userId" = u.id AND pa."profileId" = '61f25775-eb95-4ece-96e8-99ae97542af1'
         WHERE t."workspaceId" IS NULL
         GROUP BY u.username, u.email, pa.role ORDER BY n DESC`
    ).catch((e) => { console.log('  (assignee join failed: ' + e.message + ')'); return [] as any[] })
    console.log('--- Orphan tasks by assignee (hustly_role = membership in Hustly Team) ---')
    for (const a of assignees) console.log(`  ${a.username ?? a.email ?? '?'}  hustlyRole=${a.hustly_role ?? 'NOT-A-HUSTLY-MEMBER'}  tasks=${a.n}`)

    console.log('\n=== scope complete (no writes) ===')
}
main().catch((e) => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
