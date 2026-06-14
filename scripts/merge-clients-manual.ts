/**
 * [Canonical Clients] MANUAL client merge — for clients that are the SAME real
 * client but were entered under DIFFERENT names (e.g. "Mayland" vs "Mayland
 * Dental", "Dr Marwan" vs "Dr. Marwan"). The automatic migration
 * (migrate-clients-to-profile-scope.ts) only merges EXACT name-path matches;
 * these near-duplicates need a human to declare them identical.
 *
 * USAGE
 *   # 1) Find ids by name (read-only):
 *   npx tsx scripts/merge-clients-manual.ts --list mayland
 *
 *   # 2) Dry-run a merge (read-only — shows exactly what would move):
 *   npx tsx scripts/merge-clients-manual.ts --into 11 --absorb 250 --rename "Mayland Dental"
 *
 *   # 3) Commit (take a Neon snapshot FIRST!):
 *   npx tsx scripts/merge-clients-manual.ts --into 11 --absorb 250 --rename "Mayland Dental" --apply
 *
 *   --into   <id>          survivor: the row that KEEPS everything
 *   --absorb <id,id,...>   duplicate id(s) to fold into the survivor
 *   --rename "<name>"      (optional) final name for the survivor
 *   --apply                actually write (omit = dry-run)
 *
 * SAFETY: dry-run by default · refuses cross-profile merges · never hard-deletes
 * (dups → status='MERGED' + mergedIntoId, with a client.manual_merged audit row)
 * · zero data loss — Task / Invoice / Project / PricingRule / User /
 * ProfileAccess .clientId are remapped to the survivor and child clients
 * re-pointed (Rating.clientId is a USER fk → deliberately untouched, mirroring
 * the auto-migration). Existing share links keep working via mergedIntoId.
 */
import { PrismaClient } from '@prisma/client'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Dependency-free .env loader (no dotenv in the repo). No-op if env already set.
if (!process.env.DATABASE_URL) {
    try {
        const envPath = resolve(process.cwd(), '.env')
        if (existsSync(envPath)) {
            for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
                const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
                if (!m) continue
                let v = m[2].trim()
                if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
                if (process.env[m[1]] === undefined) process.env[m[1]] = v
            }
        }
    } catch { /* best-effort */ }
}

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

function argVal(flag: string): string | null {
    const i = process.argv.indexOf(flag)
    return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

/** Readable " / "-joined path for display only (NOT used for matching). */
function readablePath(id: number, byId: Map<number, { name: string; parentId: number | null }>): string {
    const names: string[] = []
    const seen = new Set<number>()
    let cur: number | null = id
    while (cur != null && !seen.has(cur)) {
        seen.add(cur)
        const c = byId.get(cur)
        if (!c) break
        names.push(c.name || '(no name)')
        cur = c.parentId
    }
    return names.reverse().join(' / ')
}

async function loadByIdForProfile(profileId: string) {
    const rows = await prisma.client.findMany({
        where: { profileId },
        select: { id: true, name: true, parentId: true },
    })
    return new Map(rows.map((r) => [r.id, { name: r.name, parentId: r.parentId }]))
}

async function counts(clientId: number) {
    const [tasks, invoices, projects, children] = await Promise.all([
        prisma.task.count({ where: { clientId } }),
        prisma.invoice.count({ where: { clientId } }),
        prisma.project.count({ where: { clientId } }),
        prisma.client.count({ where: { parentId: clientId } }),
    ])
    return { tasks, invoices, projects, children }
}

async function listMode(q: string) {
    const matches = await prisma.client.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        select: { id: true, name: true, parentId: true, profileId: true, status: true },
        orderBy: [{ profileId: 'asc' }, { name: 'asc' }],
    })
    if (matches.length === 0) {
        console.log(`\nNo client name contains "${q}".\n`)
        return
    }
    // Build a byId per profile so we can render full paths.
    const byProfile = new Map<string, Map<number, { name: string; parentId: number | null }>>()
    for (const m of matches) {
        if (!m.profileId) continue
        if (!byProfile.has(m.profileId)) byProfile.set(m.profileId, await loadByIdForProfile(m.profileId))
    }
    console.log(`\n${matches.length} client(s) whose name contains "${q}":\n`)
    for (const m of matches) {
        const byId = m.profileId ? byProfile.get(m.profileId)! : new Map()
        const c = await counts(m.id)
        const path = m.profileId ? readablePath(m.id, byId) : m.name
        console.log(
            `  #${m.id}  [${m.status}]  ${path}` +
            `   (tasks=${c.tasks}, invoices=${c.invoices}, projects=${c.projects}, sub-clients=${c.children})` +
            `   profile=${m.profileId ?? 'NULL'}`,
        )
    }
    console.log(`\nPick the survivor (--into) and the duplicate(s) (--absorb) from the ids above.\n`)
}

async function main() {
    const listQ = argVal('--list')
    if (listQ) { await listMode(listQ); return }

    const intoStr = argVal('--into')
    const absorbStr = argVal('--absorb')
    const rename = argVal('--rename')

    if (!intoStr || !absorbStr) {
        console.log(`\nUsage:\n  --list <name>                         find ids\n  --into <id> --absorb <id,id> [--rename "<name>"] [--apply]\n`)
        return
    }

    const survivorId = parseInt(intoStr, 10)
    const dupIds = absorbStr.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
    if (isNaN(survivorId) || dupIds.length === 0) {
        console.log('✖ --into must be a numeric id and --absorb a comma-separated id list.')
        process.exitCode = 1
        return
    }
    if (dupIds.includes(survivorId)) {
        console.log('✖ The survivor id cannot also be in --absorb.')
        process.exitCode = 1
        return
    }

    console.log(`\n══════ Manual client merge · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} ══════\n`)

    const survivor = await prisma.client.findUnique({
        where: { id: survivorId },
        select: { id: true, name: true, parentId: true, profileId: true, status: true },
    })
    if (!survivor) { console.log(`✖ Survivor #${survivorId} not found.`); process.exitCode = 1; return }
    if (!survivor.profileId) { console.log(`✖ Survivor #${survivorId} has no profileId (orphan) — refuse.`); process.exitCode = 1; return }

    const dups = await prisma.client.findMany({
        where: { id: { in: dupIds } },
        select: { id: true, name: true, parentId: true, profileId: true, status: true },
    })
    const foundIds = new Set(dups.map((d) => d.id))
    const missing = dupIds.filter((id) => !foundIds.has(id))
    if (missing.length) { console.log(`✖ Duplicate id(s) not found: ${missing.join(', ')}`); process.exitCode = 1; return }

    // SAFETY: never merge across profiles.
    const crossProfile = dups.filter((d) => d.profileId !== survivor.profileId)
    if (crossProfile.length) {
        console.log(`✖ Cross-profile merge refused. Survivor profile ${survivor.profileId}, but:`)
        crossProfile.forEach((d) => console.log(`    #${d.id} "${d.name}" is in profile ${d.profileId}`))
        process.exitCode = 1
        return
    }
    const alreadyMerged = dups.filter((d) => d.status === 'MERGED')
    if (alreadyMerged.length) {
        console.log(`⚠ Already-MERGED id(s) (will be re-pointed again, harmless): ${alreadyMerged.map((d) => d.id).join(', ')}`)
    }

    const byId = await loadByIdForProfile(survivor.profileId)
    const survCounts = await counts(survivor.id)
    console.log(`Survivor   #${survivor.id} [${survivor.status}]  ${readablePath(survivor.id, byId)}`)
    console.log(`           (currently tasks=${survCounts.tasks}, invoices=${survCounts.invoices}, projects=${survCounts.projects})`)
    if (rename) console.log(`           → will be RENAMED to "${rename}"`)
    console.log(`Absorbing:`)
    let movTasks = 0, movInv = 0, movProj = 0
    for (const d of dups) {
        const c = await counts(d.id)
        movTasks += c.tasks; movInv += c.invoices; movProj += c.projects
        console.log(`   #${d.id} [${d.status}]  ${readablePath(d.id, byId)}   (moves tasks=${c.tasks}, invoices=${c.invoices}, projects=${c.projects}, sub-clients=${c.children})`)
    }
    console.log(`\nTotal moving to survivor: tasks=${movTasks}, invoices=${movInv}, projects=${movProj}`)

    if (!APPLY) {
        console.log(`\nDRY-RUN — nothing written. Re-run with --apply to commit (take a Neon snapshot first!).\n`)
        return
    }

    for (const dup of dups) {
        await prisma.$transaction(async (tx) => {
            await tx.task.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.invoice.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.project.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.pricingRule.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.user.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.profileAccess.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
            await tx.client.updateMany({ where: { parentId: dup.id }, data: { parentId: survivor.id } })
            await tx.client.update({
                where: { id: dup.id },
                data: { status: 'MERGED', mergedIntoId: survivor.id, deletedAt: new Date() },
            })
            await tx.auditLog.create({
                data: {
                    workspaceId: null,
                    actorUserId: null,
                    action: 'client.manual_merged',
                    targetType: 'Client',
                    targetId: String(dup.id),
                    beforeData: { duplicateId: dup.id, duplicateName: dup.name, duplicateStatus: dup.status },
                    afterData: { survivorId: survivor.id, survivorName: rename ?? survivor.name, profileId: survivor.profileId },
                },
            })
            // [P2028] Generous budget — Neon free-tier latency can exceed the
            // default 5s interactive-transaction timeout on larger merges.
        }, { maxWait: 30_000, timeout: 120_000 })
        console.log(`  ✔ merged #${dup.id} → #${survivor.id}`)
    }

    if (rename && rename !== survivor.name) {
        await prisma.client.update({ where: { id: survivor.id }, data: { name: rename } })
        console.log(`  ✔ renamed survivor #${survivor.id} → "${rename}"`)
    }

    // Verify: no FK row still points at the merged dups.
    const stillPointing = {
        tasks: await prisma.task.count({ where: { clientId: { in: dupIds } } }),
        invoices: await prisma.invoice.count({ where: { clientId: { in: dupIds } } }),
        projects: await prisma.project.count({ where: { clientId: { in: dupIds } } }),
        children: await prisma.client.count({ where: { parentId: { in: dupIds } } }),
    }
    const leak = Object.values(stillPointing).reduce((a, b) => a + b, 0)
    console.log(`\nVerify — FK rows still pointing at merged ids: ${JSON.stringify(stillPointing)} ${leak === 0 ? '✅' : '❌ FAIL'}`)
    if (leak !== 0) process.exitCode = 1
    console.log(`\nDONE.\n`)
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
