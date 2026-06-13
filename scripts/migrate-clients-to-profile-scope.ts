/**
 * [Canonical Clients 2026-06] Migrate workspace-scoped clients → profile-scoped
 * canonical clients.
 *
 * WHAT IT DOES (per profile — NEVER across profiles):
 *   A. Backfill: clients with profileId NULL but workspaceId set get
 *      profileId = workspace.profileId. (Both NULL → logged + skipped.)
 *   B. Group every ACTIVE/SOFT_DELETED client of the profile by its
 *      normalized NAME-PATH ("jacob", "jacob/unit" — trim+lowercase per
 *      segment). Already-MERGED rows are skipped → re-running is a no-op.
 *   C. Pick one SURVIVOR per group: ACTIVE beats SOFT_DELETED; tie-break =
 *      lowest id (the oldest record carries the longest history).
 *   D. Merge the duplicates into the survivor, processed root-paths first:
 *        - remap Task / Invoice / Project / PricingRule / User /
 *          ProfileAccess .clientId  →  survivor id
 *          (Rating.clientId is a USER FK — deliberately untouched)
 *        - re-point children: Client.parentId  →  survivor id
 *        - mark duplicate: status='MERGED', mergedIntoId=survivor,
 *          deletedAt=now()  — NEVER hard-deleted (zero-data-loss rollback row)
 *        - AuditLog row `client.auto_merged` per merge = machine-readable
 *          rollback log (scripts/rollback-client-merge.ts consumes it)
 *
 * SAFETY:
 *   - DRY-RUN by default. Pass --apply to commit.
 *   - Take a Neon branch snapshot BEFORE running --apply on prod.
 *   - Built-in verification (runs in both modes, asserts after --apply):
 *       V1: no FK row (6 tables) points at a MERGED client
 *       V2: total Client row count unchanged (nothing deleted)
 *       V3: no ACTIVE duplicate (profileId, path) remains
 *       V4: no client whose parent belongs to a different profile
 *       V5: per-(profile,path) task+invoice counts identical before vs after
 *
 *   npx tsx scripts/migrate-clients-to-profile-scope.ts            # dry-run
 *   npx tsx scripts/migrate-clients-to-profile-scope.ts --apply    # commit
 *   npx tsx scripts/migrate-clients-to-profile-scope.ts --profile <id>  # limit to 1 profile
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')
const profileArgIdx = process.argv.indexOf('--profile')
const ONLY_PROFILE = profileArgIdx > -1 ? process.argv[profileArgIdx + 1] : null

interface ClientRow {
    id: number
    name: string
    parentId: number | null
    profileId: string | null
    workspaceId: string | null
    status: string
    createdAt: Date
}

/** Copy of velox-helpers buildClientPath — trim+lowercase per segment, root-first join. */
function buildClientPath(
    clientId: number,
    byId: Map<number, { name: string; parentId: number | null }>,
    maxDepth = 6,
): string {
    const names: string[] = []
    let current: number | null = clientId
    let depth = 0
    while (current != null && depth < maxDepth) {
        const c = byId.get(current)
        if (!c) break
        names.push((c.name ?? '').trim().toLowerCase())
        current = c.parentId
        depth++
    }
    return names.reverse().join('/')
}

/** Per-(profile,path) task+invoice tallies for the V5 conservation check. */
async function tallyByPath(): Promise<Map<string, { tasks: number; invoices: number }>> {
    const clients = await prisma.client.findMany({
        where: { status: { not: 'MERGED' } },
        select: { id: true, name: true, parentId: true, profileId: true },
    })
    const byId = new Map(clients.map((c) => [c.id, { name: c.name, parentId: c.parentId }]))
    const pathOf = new Map(clients.map((c) => [c.id, `${c.profileId ?? 'NULL'}::${buildClientPath(c.id, byId)}`]))

    const tally = new Map<string, { tasks: number; invoices: number }>()
    const taskCounts = await prisma.task.groupBy({ by: ['clientId'], _count: { id: true }, where: { clientId: { not: null } } })
    const invCounts = await prisma.invoice.groupBy({ by: ['clientId'], _count: { id: true } })
    for (const t of taskCounts) {
        const key = pathOf.get(t.clientId!) ?? `ORPHAN::${t.clientId}`
        const cur = tally.get(key) ?? { tasks: 0, invoices: 0 }
        cur.tasks += t._count.id
        tally.set(key, cur)
    }
    for (const i of invCounts) {
        const key = pathOf.get(i.clientId) ?? `ORPHAN::${i.clientId}`
        const cur = tally.get(key) ?? { tasks: 0, invoices: 0 }
        cur.invoices += i._count.id
        tally.set(key, cur)
    }
    return tally
}

async function main() {
    console.log(`\n══════ Canonical Clients migration · mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}${ONLY_PROFILE ? ` · profile ${ONLY_PROFILE}` : ''} ══════\n`)

    const totalBefore = await prisma.client.count()
    const tallyBefore = await tallyByPath()

    /* ── Step A — backfill profileId from workspace ─────────────────────── */
    const noProfile = await prisma.client.findMany({
        where: { profileId: null },
        select: { id: true, name: true, workspaceId: true },
    })
    let backfilled = 0
    const unattributable: number[] = []
    for (const c of noProfile) {
        if (!c.workspaceId) { unattributable.push(c.id); continue }
        const ws = await prisma.workspace.findUnique({ where: { id: c.workspaceId }, select: { profileId: true } })
        if (!ws?.profileId) { unattributable.push(c.id); continue }
        if (APPLY) {
            await prisma.client.update({ where: { id: c.id }, data: { profileId: ws.profileId } })
        }
        backfilled++
    }
    console.log(`Step A — profileId backfill: ${backfilled} ${APPLY ? 'updated' : 'would update'}, ${unattributable.length} unattributable (both profileId & workspaceId null)`)
    if (unattributable.length > 0) {
        console.log(`  ⚠ unattributable client ids (left untouched): ${unattributable.join(', ')}`)
    }

    /* ── Step B+C+D — group, pick survivor, merge (per profile) ─────────── */
    const profiles = await prisma.profile.findMany({
        where: ONLY_PROFILE ? { id: ONLY_PROFILE } : {},
        select: { id: true, name: true },
    })

    let totalGroups = 0
    let totalMerges = 0
    const nameDivergences: string[] = []

    for (const profile of profiles) {
        // In dry-run Step A hasn't written yet — emulate the backfilled view
        // by also matching clients whose workspace belongs to this profile.
        const wsIds = (await prisma.workspace.findMany({ where: { profileId: profile.id }, select: { id: true } })).map((w) => w.id)
        const clients: ClientRow[] = await prisma.client.findMany({
            where: {
                status: { in: ['ACTIVE', 'SOFT_DELETED'] },
                OR: [
                    { profileId: profile.id },
                    { profileId: null, workspaceId: { in: wsIds.length ? wsIds : ['__none__'] } },
                ],
            },
            select: { id: true, name: true, parentId: true, profileId: true, workspaceId: true, status: true, createdAt: true },
        })
        if (clients.length === 0) continue

        const byId = new Map(clients.map((c) => [c.id, { name: c.name, parentId: c.parentId }]))
        const groups = new Map<string, ClientRow[]>()
        for (const c of clients) {
            const path = buildClientPath(c.id, byId)
            if (!path) continue // empty name — leave alone
            const arr = groups.get(path) ?? []
            arr.push(c)
            groups.set(path, arr)
        }

        // Only groups with >1 member need merging. Sort by path depth so roots
        // merge before children (children of a merged root re-point cleanly).
        const dupGroups = [...groups.entries()]
            .filter(([, members]) => members.length > 1)
            .sort(([a], [b]) => a.split('/').length - b.split('/').length)

        if (dupGroups.length === 0) continue
        totalGroups += dupGroups.length
        console.log(`\nProfile "${profile.name}" (${profile.id}) — ${dupGroups.length} duplicate group(s):`)

        for (const [path, members] of dupGroups) {
            // Survivor: ACTIVE first, then lowest id.
            const sorted = [...members].sort((a, b) => {
                if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1
                return a.id - b.id
            })
            const survivor = sorted[0]
            const duplicates = sorted.slice(1)

            const displayNames = new Set(members.map((m) => m.name))
            if (displayNames.size > 1) {
                nameDivergences.push(`"${path}": ${[...displayNames].join(' | ')} → keeps "${survivor.name}"`)
            }

            console.log(`  "${path}": survivor #${survivor.id} (${survivor.status}) absorbs ${duplicates.map((d) => `#${d.id}`).join(', ')}`)

            for (const dup of duplicates) {
                totalMerges++
                if (!APPLY) continue

                await prisma.$transaction(async (tx) => {
                    const counts = {
                        tasks: await tx.task.count({ where: { clientId: dup.id } }),
                        invoices: await tx.invoice.count({ where: { clientId: dup.id } }),
                        projects: await tx.project.count({ where: { clientId: dup.id } }),
                    }
                    await tx.task.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    await tx.invoice.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    await tx.project.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    await tx.pricingRule.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    await tx.user.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    await tx.profileAccess.updateMany({ where: { clientId: dup.id }, data: { clientId: survivor.id } })
                    // Children of the duplicate hang under the survivor now.
                    await tx.client.updateMany({ where: { parentId: dup.id }, data: { parentId: survivor.id } })
                    // Mark — never delete. Original workspaceId/parentId stay for forensics.
                    await tx.client.update({
                        where: { id: dup.id },
                        data: {
                            status: 'MERGED',
                            mergedIntoId: survivor.id,
                            deletedAt: new Date(),
                            // Ensure the merged row also carries profileId (Step A may
                            // not have covered dry-run-only-visible rows).
                            profileId: profile.id,
                        },
                    })
                    await tx.auditLog.create({
                        data: {
                            workspaceId: dup.workspaceId,
                            actorUserId: null,
                            action: 'client.auto_merged',
                            targetType: 'Client',
                            targetId: String(dup.id),
                            beforeData: {
                                duplicateId: dup.id,
                                duplicateName: dup.name,
                                duplicateStatus: dup.status,
                                duplicateWorkspaceId: dup.workspaceId,
                                duplicateParentId: dup.parentId,
                                path,
                                remapped: counts,
                            },
                            afterData: { survivorId: survivor.id, survivorName: survivor.name, profileId: profile.id },
                        },
                    })
                })

                // Survivor adopts profileId if it was workspace-only pre-backfill.
                if (APPLY && !survivor.profileId) {
                    await prisma.client.update({ where: { id: survivor.id }, data: { profileId: profile.id } })
                    survivor.profileId = profile.id
                }
            }
        }
    }

    console.log(`\nStep B-D summary: ${totalGroups} duplicate group(s), ${totalMerges} client(s) ${APPLY ? 'merged' : 'would merge'}.`)
    if (nameDivergences.length > 0) {
        console.log(`\n⚠ Display-name divergences (survivor's name wins — review):`)
        for (const d of nameDivergences) console.log(`  ${d}`)
    }

    /* ── Verification ──────────────────────────────────────────────────── */
    console.log(`\n══════ Verification ══════`)

    // V1 — no FK rows point at MERGED clients
    const mergedIds = (await prisma.client.findMany({ where: { status: 'MERGED' }, select: { id: true } })).map((c) => c.id)
    if (mergedIds.length > 0) {
        const v1 = {
            tasks: await prisma.task.count({ where: { clientId: { in: mergedIds } } }),
            invoices: await prisma.invoice.count({ where: { clientId: { in: mergedIds } } }),
            projects: await prisma.project.count({ where: { clientId: { in: mergedIds } } }),
            pricingRules: await prisma.pricingRule.count({ where: { clientId: { in: mergedIds } } }),
            users: await prisma.user.count({ where: { clientId: { in: mergedIds } } }),
            profileAccesses: await prisma.profileAccess.count({ where: { clientId: { in: mergedIds } } }),
            children: await prisma.client.count({ where: { parentId: { in: mergedIds } } }),
        }
        const v1Total = Object.values(v1).reduce((a, b) => a + b, 0)
        console.log(`V1 — FK rows still pointing at MERGED clients: ${JSON.stringify(v1)} ${v1Total === 0 ? '✅' : '❌ FAIL'}`)
        if (APPLY && v1Total !== 0) process.exitCode = 1
    } else {
        console.log(`V1 — no MERGED clients exist ${APPLY && totalMerges > 0 ? '❌ (expected some)' : '✅'}`)
    }

    // V2 — zero loss: row count unchanged
    const totalAfter = await prisma.client.count()
    console.log(`V2 — Client row count: before=${totalBefore} after=${totalAfter} ${totalBefore === totalAfter ? '✅' : '❌ FAIL'}`)
    if (APPLY && totalBefore !== totalAfter) process.exitCode = 1

    // V3 — no remaining ACTIVE duplicates per (profile, path)
    {
        const active = await prisma.client.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, name: true, parentId: true, profileId: true },
        })
        const byId = new Map(active.map((c) => [c.id, { name: c.name, parentId: c.parentId }]))
        const seen = new Map<string, number>()
        let dups = 0
        for (const c of active) {
            if (!c.profileId) continue
            const key = `${c.profileId}::${buildClientPath(c.id, byId)}`
            seen.set(key, (seen.get(key) ?? 0) + 1)
        }
        for (const [key, n] of seen) if (n > 1) { dups++; console.log(`  duplicate remains: ${key} ×${n}`) }
        console.log(`V3 — remaining ACTIVE duplicate paths: ${dups} ${APPLY ? (dups === 0 ? '✅' : '❌ FAIL') : '(informational in dry-run)'}`)
        if (APPLY && dups !== 0) process.exitCode = 1
    }

    // V4 — no cross-profile parentage
    {
        const all = await prisma.client.findMany({
            where: { parentId: { not: null }, status: { not: 'MERGED' } },
            select: { id: true, profileId: true, parent: { select: { id: true, profileId: true } } },
        })
        const bad = all.filter((c) => c.parent && c.profileId && c.parent.profileId && c.parent.profileId !== c.profileId)
        console.log(`V4 — cross-profile parent links: ${bad.length} ${bad.length === 0 ? '✅' : '❌ FAIL'}`)
        if (bad.length) bad.forEach((b) => console.log(`  client #${b.id} (profile ${b.profileId}) → parent #${b.parent!.id} (profile ${b.parent!.profileId})`))
        if (APPLY && bad.length !== 0) process.exitCode = 1
    }

    // V5 — conservation: per-(profile,path) task+invoice sums identical
    if (APPLY) {
        const tallyAfter = await tallyByPath()
        let mismatches = 0
        const keys = new Set([...tallyBefore.keys(), ...tallyAfter.keys()])
        for (const k of keys) {
            const b = tallyBefore.get(k) ?? { tasks: 0, invoices: 0 }
            const a = tallyAfter.get(k) ?? { tasks: 0, invoices: 0 }
            if (b.tasks !== a.tasks || b.invoices !== a.invoices) {
                mismatches++
                console.log(`  Σ mismatch ${k}: tasks ${b.tasks}→${a.tasks}, invoices ${b.invoices}→${a.invoices}`)
            }
        }
        console.log(`V5 — per-path task/invoice conservation: ${mismatches} mismatch(es) ${mismatches === 0 ? '✅' : '❌ FAIL'}`)
        if (mismatches !== 0) process.exitCode = 1
    } else {
        console.log(`V5 — conservation check runs after --apply`)
    }

    console.log(`\n${APPLY ? 'DONE.' : 'DRY-RUN complete — pass --apply to commit (take a Neon snapshot first!).'}\n`)
}

main()
    .then(() => prisma.$disconnect())
    .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
