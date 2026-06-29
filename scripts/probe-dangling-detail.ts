/** READ-ONLY: detail the dangling Payment rows + profileId-NULL tasks + orphan workspaces. */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const q = (sql: string, ...a: any[]) => prisma.$queryRawUnsafe<any[]>(sql, ...a)

async function main() {
    console.log('=== Dangling detail (READ-ONLY) ===\n')

    // 1. The 4 dangling Payment rows — which workspace (missing), profile, client, amount, date.
    const pay = await q(
        `SELECT pm.*, p.name AS profile_name
         FROM "Payment" pm
         LEFT JOIN "Workspace" w ON pm."workspaceId" = w.id
         LEFT JOIN "Profile" p ON pm."profileId" = p.id
         WHERE pm."workspaceId" IS NOT NULL AND w.id IS NULL`
    )
    console.log(`--- 1. Dangling Payment rows: ${pay.length} ---`)
    for (const r of pay) {
        console.log(`  id=${String(r.id).slice(0,8)} missingWs=${String(r.workspaceId).slice(0,8)} profile=${r.profile_name ?? r.profileId ?? '-'} ` +
            `client=${r.clientId ?? '-'} amount=${r.amount ?? r.amountVND ?? r.value ?? '?'} ` +
            `created=${r.createdAt ? new Date(r.createdAt).toISOString().slice(0,10) : (r.paidAt ? new Date(r.paidAt).toISOString().slice(0,10) : '-')}`)
    }
    // Are all 4 pointing at the SAME missing workspace id?
    const distinctWs = [...new Set(pay.map((r) => r.workspaceId))]
    console.log(`  distinct missing workspaceIds: ${distinctWs.length} → ${distinctWs.map((x) => String(x).slice(0,8)).join(', ')}`)
    // Does the recovered June workspace exist to re-link them to?
    const june = await q(`SELECT id FROM "Workspace" WHERE name='Tháng 6/2026' AND "profileId"='61f25775-eb95-4ece-96e8-99ae97542af1' LIMIT 1`)
    console.log(`  recovered June ws id = ${june[0]?.id ?? '(none)'}\n`)

    // 2. The 9 profileId-NULL tasks — are they the old orphan "Tháng 3" (a6d97ddb) tasks?
    const t = await q(
        `SELECT id, title, "workspaceId", status, "createdAt" FROM "Task" WHERE "profileId" IS NULL ORDER BY "createdAt"`
    )
    console.log(`--- 2. Task.profileId NULL: ${t.length} ---`)
    for (const r of t) {
        console.log(`  ${new Date(r.createdAt).toISOString().slice(0,10)} ws=${r.workspaceId ? String(r.workspaceId).slice(0,8) : 'NULL'} status=${r.status} "${String(r.title ?? '').slice(0,40)}"`)
    }
    console.log('')

    // 3. The 2 orphan workspaces' task counts (pre-existing context).
    const orph = await q(
        `SELECT w.id, w.name, COUNT(t.id)::int AS tasks
         FROM "Workspace" w LEFT JOIN "Task" t ON t."workspaceId"=w.id
         WHERE w."profileId" IS NULL GROUP BY w.id, w.name ORDER BY w."createdAt"`
    )
    console.log('--- 3. Orphan (profileId NULL) workspaces ---')
    for (const r of orph) console.log(`  "${r.name}" (${r.id.slice(0,8)}) tasks=${r.tasks}`)

    console.log('\n=== detail complete (no writes) ===')
}
main().catch((e) => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
