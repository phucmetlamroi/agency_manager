/* READ-ONLY. Are the same-named ACTIVE clients per-workspace DUPLICATES of one real client
 * (which the name-path scope exists to reunite), or genuinely different customers (which it
 * would then wrongly merge)? Duplicates never share a workspace; distinct customers can. */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const rows = await prisma.$queryRaw`
    SELECT lower(btrim(c.name)) AS n, c.id, c."parentId",
           COUNT(t.id) AS tasks,
           COUNT(DISTINCT t."workspaceId") AS workspaces,
           ARRAY_AGG(DISTINCT t."workspaceId") FILTER (WHERE t."workspaceId" IS NOT NULL) AS ws
    FROM "Client" c LEFT JOIN "Task" t ON t."clientId" = c.id
    WHERE c.status='ACTIVE' AND lower(btrim(c.name)) IN
        ('think fire','brad','jake','josh','simply medicals','sophie','unit','motohalo','abc','ilham')
    GROUP BY 1,2,3 ORDER BY 1, c.id`
const byName = new Map()
for (const r of rows) { const a = byName.get(r.n) ?? []; a.push(r); byName.set(r.n, a) }
for (const [n, group] of byName) {
    const seen = new Map()
    let overlap = false
    for (const g of group) for (const w of (g.ws ?? [])) {
        if (seen.has(w)) overlap = true; else seen.set(w, g.id)
    }
    console.log(`\n"${n}"  ${overlap ? '*** SHARES A WORKSPACE -> possibly DISTINCT customers ***' : 'no shared workspace -> consistent with per-workspace duplicates'}`)
    for (const g of group) console.log(`   #${g.id} parent=${g.parentId} tasks=${g.tasks} workspaces=${g.workspaces}`)
}
await prisma.$disconnect()
