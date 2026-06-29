/**
 * Finish the June recovery: re-link Hustly's 4 dangling Payment rows (workspaceId →
 * the deleted original June workspace b3137dde…) onto the recovered June workspace.
 * Scoped to (profileId=Hustly AND workspaceId points to a missing Workspace) so it can
 * only touch Hustly's own orphaned payments. --dry-run default; --apply to write.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const q = (sql: string, ...a: any[]) => prisma.$queryRawUnsafe<any[]>(sql, ...a)
const APPLY = process.argv.includes('--apply')
const HUSTLY = '61f25775-eb95-4ece-96e8-99ae97542af1'

async function main() {
    console.log(`=== Fix June dangling payments ${APPLY ? '(APPLY)' : '(DRY-RUN)'} ===\n`)

    const june = await q(`SELECT id, name FROM "Workspace" WHERE name='Tháng 6/2026' AND "profileId"=$1 LIMIT 1`, HUSTLY)
    if (!june.length) { console.log('❌ Recovered June workspace not found — abort.'); return }
    const newWsId = june[0].id
    console.log(`Recovered June ws: ${newWsId}`)

    const dangling = await q(
        `SELECT pm.id, pm."workspaceId", pm."clientId"
         FROM "Payment" pm LEFT JOIN "Workspace" w ON pm."workspaceId" = w.id
         WHERE pm."profileId" = $1 AND pm."workspaceId" IS NOT NULL AND w.id IS NULL`,
        HUSTLY,
    )
    console.log(`Dangling Hustly payments to re-link: ${dangling.length}`)
    for (const d of dangling) console.log(`  payment ${String(d.id).slice(0,8)} (client ${d.clientId}) ws→${String(d.workspaceId).slice(0,8)}`)

    if (dangling.length === 0) { console.log('\n✅ Nothing to fix.'); return }
    if (!APPLY) { console.log(`\n💡 DRY-RUN. --apply re-links ${dangling.length} payments → ${String(newWsId).slice(0,8)}.`); return }

    const res = await prisma.$executeRawUnsafe(
        `UPDATE "Payment" SET "workspaceId" = $1
         WHERE "profileId" = $2 AND "workspaceId" IS NOT NULL
           AND "workspaceId" NOT IN (SELECT id FROM "Workspace")`,
        newWsId, HUSTLY,
    )
    console.log(`\n✅ Re-linked ${res} payment(s) to the recovered June workspace.`)

    const remain = await q(
        `SELECT COUNT(*)::int AS n FROM "Payment" pm LEFT JOIN "Workspace" w ON pm."workspaceId"=w.id
         WHERE pm."workspaceId" IS NOT NULL AND w.id IS NULL`)
    console.log(`Verify: remaining dangling payments system-wide = ${remain[0].n}`)
}
main().catch((e) => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
