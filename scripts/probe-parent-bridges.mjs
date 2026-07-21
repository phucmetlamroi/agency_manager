/* READ-ONLY prod probe. Answers exactly one question, asked by the adversarial review:
 *
 *   Does any ACTIVE client hang off a NON-ACTIVE parent inside the same profile?
 *
 * Every such row is a scope edge that only becomes reachable once the parentId walk in
 * share-link-auth.ts ships. Given the documented mis-parenting the canonical-client merge
 * left behind (scripts/fix-jacob-detach-children.ts repaired only ACTIVE children under
 * client 1), an un-repaired non-ACTIVE bridge with a live child would let one client's
 * token read another client's tasks, prices and invoices.
 *
 * Zero rows  => the walk is a strict no-op on today's data; risk is prospective only.
 * Any rows   => each must be inspected before the change can ship.
 *
 * SELECT only. Nothing is written.
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const rows = await prisma.$queryRaw`
    SELECT c.id            AS child_id,
           c.name          AS child_name,
           c.status        AS child_status,
           p.id            AS bridge_id,
           p.name          AS bridge_name,
           p.status        AS bridge_status,
           c."profileId"   AS profile_id,
           (SELECT COUNT(*) FROM "Task" t WHERE t."clientId" = c.id)    AS child_tasks,
           (SELECT COUNT(*) FROM "Invoice" i WHERE i."clientId" = c.id) AS child_invoices
    FROM "Client" c
    JOIN "Client" p ON c."parentId" = p.id
    WHERE c.status = 'ACTIVE'
      AND p.status <> 'ACTIVE'
      AND c."profileId" = p."profileId"
    ORDER BY p.id, c.id
`

console.log(`\n=== ACTIVE clients hanging off a NON-ACTIVE parent (same profile) ===`)
console.log(`rows: ${rows.length}\n`)
for (const r of rows) {
    console.log(
        `  child #${r.child_id} "${r.child_name}" [${r.child_status}]  ` +
        `via bridge #${r.bridge_id} "${r.bridge_name}" [${r.bridge_status}]  ` +
        `tasks=${r.child_tasks} invoices=${r.child_invoices}`,
    )
}

// Second question: how big is the full-profile scan the change introduces?
const byStatus = await prisma.client.groupBy({ by: ['status'], _count: { _all: true } })
console.log(`\n=== Client rows by status (whole DB) ===`)
for (const s of byStatus) console.log(`  ${s.status.padEnd(14)} ${s._count._all}`)

await prisma.$disconnect()
