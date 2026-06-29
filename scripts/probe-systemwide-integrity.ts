/**
 * READ-ONLY system-wide data-integrity audit: "did anyone else get hit like Hustly?"
 * Zero writes. Detects the exact signature of the incident across ALL tenants:
 *   - DANGLING references: any row whose workspaceId/profileId points to a parent that
 *     no longer exists (= a deleted workspace/profile left children behind).
 *   - ORPHAN nulls: Task/Workspace with NULL workspaceId/profileId.
 *   - Per-profile health: profiles that have tasks but 0 active workspaces (victim shape).
 *   - Trash: soft-deleted profiles + workspaces.
 * Covers EVERY table dynamically via information_schema (no table missed).
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const q = (sql: string, ...a: any[]) => prisma.$queryRawUnsafe<any[]>(sql, ...a)

async function main() {
    console.log('=== SYSTEM-WIDE integrity audit (READ-ONLY) ===\n')

    // 1. DANGLING workspaceId across every table that has the column.
    const wsCols = await q(
        `SELECT table_name FROM information_schema.columns
         WHERE column_name='workspaceId' AND table_schema='public' ORDER BY table_name`
    )
    console.log(`--- 1. Dangling workspaceId (row → missing Workspace) across ${wsCols.length} tables ---`)
    let wsDangerTotal = 0
    for (const { table_name } of wsCols) {
        try {
            const r = await q(
                `SELECT COUNT(*)::int AS n FROM "${table_name}" t
                 LEFT JOIN "Workspace" w ON t."workspaceId" = w.id
                 WHERE t."workspaceId" IS NOT NULL AND w.id IS NULL`
            )
            const n = r[0].n
            wsDangerTotal += n
            console.log(`  ${n > 0 ? '🚨' : '✓ '} ${table_name}: ${n}`)
        } catch (e: any) { console.log(`  ?  ${table_name}: (skip: ${e.message?.slice(0, 40)})`) }
    }
    console.log(`  → total dangling-workspace rows: ${wsDangerTotal}\n`)

    // 2. DANGLING profileId across every table that has the column.
    const pCols = await q(
        `SELECT table_name FROM information_schema.columns
         WHERE column_name='profileId' AND table_schema='public' ORDER BY table_name`
    )
    console.log(`--- 2. Dangling profileId (row → missing Profile) across ${pCols.length} tables ---`)
    let pDangerTotal = 0
    for (const { table_name } of pCols) {
        try {
            const r = await q(
                `SELECT COUNT(*)::int AS n FROM "${table_name}" t
                 LEFT JOIN "Profile" p ON t."profileId" = p.id
                 WHERE t."profileId" IS NOT NULL AND p.id IS NULL`
            )
            const n = r[0].n
            pDangerTotal += n
            console.log(`  ${n > 0 ? '🚨' : '✓ '} ${table_name}: ${n}`)
        } catch (e: any) { console.log(`  ?  ${table_name}: (skip: ${e.message?.slice(0, 40)})`) }
    }
    console.log(`  → total dangling-profile rows: ${pDangerTotal}\n`)

    // 3. Orphan NULLs.
    const taskNullWs = await q(`SELECT COUNT(*)::int AS n FROM "Task" WHERE "workspaceId" IS NULL`)
    const taskNullProf = await q(`SELECT COUNT(*)::int AS n FROM "Task" WHERE "profileId" IS NULL`)
    const wsNullProf = await q(`SELECT COUNT(*)::int AS n FROM "Workspace" WHERE "profileId" IS NULL`)
    console.log('--- 3. Orphan NULLs ---')
    console.log(`  Task.workspaceId NULL: ${taskNullWs[0].n}`)
    console.log(`  Task.profileId   NULL: ${taskNullProf[0].n}`)
    console.log(`  Workspace.profileId NULL (orphan workspaces): ${wsNullProf[0].n}`)
    if (wsNullProf[0].n > 0) {
        const ws = await q(`SELECT id, name, status, "createdAt" FROM "Workspace" WHERE "profileId" IS NULL ORDER BY "createdAt"`)
        for (const w of ws) console.log(`      • "${w.name}" (${w.id.slice(0,8)}) status=${w.status} created=${new Date(w.createdAt).toISOString().slice(0,10)}`)
    }
    console.log('')

    // 4. Per-profile health — profiles with tasks but few/no active workspaces (victim shape).
    console.log('--- 4. Per-profile: active ws / soft-deleted ws / tasks (flag tasks>0 & activeWs=0) ---')
    const rows = await q(`
        SELECT p.id, p.name,
          (SELECT COUNT(*)::int FROM "Workspace" w WHERE w."profileId"=p.id AND w.status='ACTIVE')       AS active_ws,
          (SELECT COUNT(*)::int FROM "Workspace" w WHERE w."profileId"=p.id AND w.status='SOFT_DELETED')  AS trash_ws,
          (SELECT COUNT(*)::int FROM "Task" t WHERE t."profileId"=p.id)                                   AS tasks
        FROM "Profile" p ORDER BY tasks DESC`)
    for (const r of rows) {
        const flag = (r.tasks > 0 && r.active_ws === 0) ? ' 🚨 tasks-but-no-active-ws' : ''
        if (r.tasks > 0 || r.trash_ws > 0 || flag) {
            console.log(`  "${r.name}" (${r.id.slice(0,8)}): activeWs=${r.active_ws} trashWs=${r.trash_ws} tasks=${r.tasks}${flag}`)
        }
    }
    console.log('')

    // 5. Trash: soft-deleted profiles + workspaces system-wide.
    const delProfiles = await q(`SELECT id, name, status FROM "Profile" WHERE status='SOFT_DELETED'`).catch(() => [])
    const delWs = await q(`SELECT id, name, "profileId", "deletedAt" FROM "Workspace" WHERE status='SOFT_DELETED' ORDER BY "deletedAt" DESC`).catch(() => [])
    console.log(`--- 5. Trash: soft-deleted profiles=${delProfiles.length}, workspaces=${delWs.length} ---`)
    for (const p of delProfiles) console.log(`  PROFILE "${p.name}" (${p.id.slice(0,8)})`)
    for (const w of delWs) console.log(`  WS "${w.name}" (${w.id.slice(0,8)}) profile=${w.profileId?.slice(0,8) ?? 'NULL'} deletedAt=${w.deletedAt ? new Date(w.deletedAt).toISOString().slice(0,10) : '-'}`)

    console.log('\n=== VERDICT ===')
    const clean = wsDangerTotal === 0 && pDangerTotal === 0 && taskNullWs[0].n === 0
    console.log(clean
        ? '  ✅ No dangling refs, no orphan tasks system-wide → no OTHER tenant lost a workspace (Hustly recovered).'
        : '  🚨 Anomalies found above — another tenant may have been hit. Investigate the 🚨 lines.')
    console.log('\n=== audit complete (no writes) ===')
}
main().catch((e) => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
