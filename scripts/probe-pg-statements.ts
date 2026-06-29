/**
 * READ-ONLY: last-resort DB-side forensic to attribute the workspace deletion.
 * Checks pg_stat_statements (if enabled) for any DELETE touching "Workspace",
 * lists installed audit/stat extensions, and dumps auth-login activity in the
 * deletion window. Zero writes.
 */
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const q = (sql: string, ...a: any[]) => prisma.$queryRawUnsafe<any[]>(sql, ...a)

async function main() {
    console.log('=== pg statement / attribution forensic (READ-ONLY) ===\n')

    // 1. Installed extensions (is statement/audit logging even possible?).
    try {
        const ext = await q(`SELECT extname FROM pg_extension ORDER BY extname`)
        console.log('--- 1. Installed extensions ---')
        console.log('  ' + ext.map((e) => e.extname).join(', '))
    } catch (e: any) { console.log('  ext query failed: ' + e.message) }
    console.log('')

    // 2. pg_stat_statements — any DELETE on Workspace (+ how many times / rows).
    console.log('--- 2. pg_stat_statements: DELETE/UPDATE statements touching Workspace or Task ---')
    try {
        const st = await q(
            `SELECT calls, rows, query FROM pg_stat_statements
             WHERE (query ILIKE '%delete%' OR query ILIKE '%update%')
               AND (query ILIKE '%Workspace%' OR query ILIKE '%"Task"%')
             ORDER BY calls DESC LIMIT 40`
        )
        if (!st.length) console.log('  (no matching statements — extension empty or recently reset)')
        for (const s of st) {
            console.log(`  calls=${s.calls} rows=${s.rows} :: ${String(s.query).replace(/\s+/g, ' ').slice(0, 160)}`)
        }
    } catch (e: any) {
        console.log('  pg_stat_statements NOT available: ' + e.message.slice(0, 120))
    }
    console.log('')

    // 3. When were pg_stat_statements stats last reset (coverage window)?
    try {
        const r = await q(`SELECT stats_reset FROM pg_stat_statements_info`)
        console.log('--- 3. pg_stat_statements stats_reset ---')
        console.log('  ' + (r[0]?.stats_reset ? new Date(r[0].stats_reset).toISOString() : 'unknown'))
    } catch { console.log('--- 3. pg_stat_statements_info not available ---') }
    console.log('')

    // 4. All auth-login activity 28-Jun 00:00 .. 29-Jun 08:00 UTC (who was active).
    const logins = await q(
        `SELECT a."createdAt", a.action, a."actorUserId", u.username, a."ipAddress"
         FROM "AuditLog" a LEFT JOIN "User" u ON u.id = a."actorUserId"
         WHERE a.action LIKE 'auth.%' AND a."createdAt" >= '2026-06-28T00:00:00Z' AND a."createdAt" <= '2026-06-29T08:00:00Z'
         ORDER BY a."createdAt"`
    ).catch((e) => { console.log('  auth query failed: ' + e.message); return [] as any[] })
    console.log(`--- 4. auth.* events 28-Jun 00:00 .. 29-Jun 08:00 UTC: ${logins.length} ---`)
    for (const l of logins) {
        console.log(`  ${new Date(l.createdAt).toISOString()} [${l.action}] ${l.username ?? l.actorUserId?.slice(0,8) ?? '-'} ip=${l.ipAddress ?? '-'}`)
    }

    console.log('\n=== forensic complete (no writes) ===')
}
main().catch((e) => { console.error('error:', e); process.exit(1) }).finally(() => prisma.$disconnect())
