/** Read-only: pick the richest profile/workspace on the TEST branch to audit against. */
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { join } from 'path'

const url = (() => {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    const m = raw.match(/^DATABASE_URL\s*=\s*(.*)$/m)!
    return m[1].trim().replace(/^["']|["']$/g, '')
})()
if (!url.includes('round-lab') || url.includes('autumn-flower')) { console.error('DỪNG: không phải nhánh thử nghiệm.'); process.exit(1) }

const db = new PrismaClient({ datasources: { db: { url } }, log: ['error'] })

async function main() {
    const rows = await db.$queryRaw<{ profileid: string; pname: string; wcount: bigint; tcount: bigint; ucount: bigint }[]>`
        SELECT p.id AS profileid, p.name AS pname,
               (SELECT COUNT(*) FROM "Workspace" w WHERE w."profileId" = p.id) AS wcount,
               (SELECT COUNT(*) FROM "Task" t WHERE t."profileId" = p.id) AS tcount,
               (SELECT COUNT(*) FROM "ProfileAccess" pa WHERE pa."profileId" = p.id) AS ucount
        FROM "Profile" p ORDER BY tcount DESC LIMIT 5`
    console.log('TOP PROFILE theo số task:')
    for (const r of rows) console.log(`  ${r.pname.padEnd(28)} id=${r.profileid}  ws=${r.wcount}  task=${r.tcount}  thanhvien=${r.ucount}`)

    const top = rows[0]
    const ws = await db.$queryRaw<{ id: string; name: string; n: bigint; assets: bigint }[]>`
        SELECT w.id, w.name,
               (SELECT COUNT(*) FROM "Task" t WHERE t."workspaceId" = w.id) AS n,
               (SELECT COUNT(*) FROM "ReviewAsset" a WHERE a."workspaceId" = w.id) AS assets
        FROM "Workspace" w WHERE w."profileId" = ${top.profileid}
        ORDER BY n DESC LIMIT 6`
    console.log(`\nWORKSPACE trong "${top.pname}":`)
    for (const w of ws) console.log(`  ${w.name.padEnd(22)} id=${w.id}  task=${w.n}  video=${w.assets}`)

    const roles = await db.$queryRaw<{ role: string; n: bigint }[]>`
        SELECT role, COUNT(*) AS n FROM "ProfileAccess" WHERE "profileId" = ${top.profileid} GROUP BY role`
    console.log('\nVAI TRÒ tầng tổ chức đang có:', roles.map((r) => `${r.role}=${r.n}`).join(' · '))

    const wsRoles = await db.$queryRaw<{ role: string; n: bigint }[]>`
        SELECT role, COUNT(*) AS n FROM "WorkspaceMember" GROUP BY role ORDER BY n DESC`
    console.log('VAI TRÒ tầng workspace (toàn hệ):', wsRoles.map((r) => `${r.role}=${r.n}`).join(' · '))

    const uRoles = await db.$queryRaw<{ role: string; n: bigint }[]>`
        SELECT role, COUNT(*) AS n FROM "User" GROUP BY role ORDER BY n DESC`
    console.log('VAI TRÒ tầng tài khoản (toàn hệ):', uRoles.map((r) => `${r.role}=${r.n}`).join(' · '))

    // Column shape of User — which fields are NOT NULL without a default (must be supplied).
    const req = await db.$queryRaw<{ column_name: string; data_type: string }[]>`
        SELECT column_name, data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='User'
          AND is_nullable='NO' AND column_default IS NULL ORDER BY column_name`
    console.log('\nUser — cột BẮT BUỘC phải cấp:', req.map((c) => `${c.column_name}:${c.data_type}`).join(', '))
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
