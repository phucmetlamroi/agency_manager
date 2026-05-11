/**
 * [Sprint T] Restore orphan tasks visibility.
 *
 * 17 orphan tasks system-wide:
 *  - 8 tasks workspaceId=NULL (1 Hustly Team Mar 6 + 7 Kẻ Cô Độc Apr 25)
 *  - 9 tasks profileId=NULL (all workspace a6d97ddb, Mar 15)
 *
 * Strategy:
 *   A. workspaceId=NULL: find best-matching workspace in same profile
 *      based on task.createdAt month + workspace.name pattern "Tháng N/YYYY"
 *      Fallback: oldest active workspace in profile.
 *   B. profileId=NULL: lookup workspace.profileId and set on task.
 *
 * Idempotent — chỉ update tasks còn match điều kiện. Re-run an toàn.
 * Audit log each fix.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function findBestWorkspaceForProfile(
    profileId: string,
    taskCreatedAt: Date,
): Promise<{ id: string; name: string } | null> {
    const workspaces = await prisma.workspace.findMany({
        where: { profileId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, createdAt: true },
    })
    if (workspaces.length === 0) return null

    // Match by month: workspace name like "Tháng N" or "Tháng N/YYYY"
    const month = taskCreatedAt.getMonth() + 1 // 1-12
    const year = taskCreatedAt.getFullYear()

    // Try exact "Tháng N/YYYY" match first
    const exactMatch = workspaces.find((w) => {
        const lower = w.name.toLowerCase()
        return lower.includes(`tháng ${month}/${year}`) || lower.includes(`tháng ${month} `) || lower.endsWith(`tháng ${month}`)
    })
    if (exactMatch) return exactMatch

    // Fallback: workspace whose name contains the month number alone
    const monthMatch = workspaces.find((w) =>
        new RegExp(`tháng\\s*${month}(?!\\d)`, 'i').test(w.name),
    )
    if (monthMatch) return monthMatch

    // Final fallback: oldest workspace
    workspaces.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    return workspaces[0] || null
}

async function main() {
    console.log('=== Sprint T: Restore orphan tasks ===\n')

    // === A. workspaceId=NULL tasks ===
    const noWsTasks = await prisma.task.findMany({
        where: { workspaceId: null },
        select: { id: true, title: true, status: true, profileId: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
    })

    console.log(`A. Tasks with workspaceId=NULL: ${noWsTasks.length}\n`)

    let aFixedCount = 0
    let aSkippedCount = 0
    for (const t of noWsTasks) {
        if (!t.profileId) {
            console.log(`  ${t.id.slice(0, 8)} — SKIP (both profileId & workspaceId NULL)`)
            aSkippedCount++
            continue
        }

        const ws = await findBestWorkspaceForProfile(t.profileId, t.createdAt)
        if (!ws) {
            console.log(`  ${t.id.slice(0, 8)} — SKIP (profile ${t.profileId.slice(0, 8)} has no active workspace)`)
            aSkippedCount++
            continue
        }

        await prisma.task.update({
            where: { id: t.id },
            data: { workspaceId: ws.id, version: { increment: 1 } },
        })
        console.log(`  ✓ ${t.id.slice(0, 8)} "${t.title?.slice(0, 40)}" → ws "${ws.name}" (${ws.id.slice(0, 8)})`)
        aFixedCount++
    }
    console.log(`\n  A summary: fixed=${aFixedCount}  skipped=${aSkippedCount}`)

    // === B. profileId=NULL but workspaceId set ===
    const noProfileTasks = await prisma.task.findMany({
        where: { profileId: null, workspaceId: { not: null } },
        select: { id: true, title: true, workspaceId: true },
    })

    console.log(`\nB. Tasks with profileId=NULL (workspaceId set): ${noProfileTasks.length}\n`)

    let bFixedCount = 0
    let bSkippedCount = 0
    for (const t of noProfileTasks) {
        const ws = await prisma.workspace.findUnique({
            where: { id: t.workspaceId! },
            select: { profileId: true, name: true },
        })
        if (!ws?.profileId) {
            console.log(`  ${t.id.slice(0, 8)} — SKIP (workspace ${t.workspaceId?.slice(0, 8)} has no profileId)`)
            bSkippedCount++
            continue
        }
        await prisma.task.update({
            where: { id: t.id },
            data: { profileId: ws.profileId, version: { increment: 1 } },
        })
        console.log(`  ✓ ${t.id.slice(0, 8)} "${t.title?.slice(0, 40)}" → profile ${ws.profileId.slice(0, 8)} (ws "${ws.name}")`)
        bFixedCount++
    }
    console.log(`\n  B summary: fixed=${bFixedCount}  skipped=${bSkippedCount}`)

    // === Verify ===
    console.log('\n=== Verification ===')
    const stillOrphan = await prisma.task.count({
        where: {
            OR: [{ workspaceId: null }, { profileId: null }],
        },
    })
    console.log(`Remaining orphan tasks (should be 0): ${stillOrphan}`)
    if (stillOrphan > 0) {
        const remaining = await prisma.task.findMany({
            where: { OR: [{ workspaceId: null }, { profileId: null }] },
            select: { id: true, title: true, workspaceId: true, profileId: true },
        })
        for (const t of remaining) {
            console.log(`  ${t.id.slice(0, 8)} ws=${t.workspaceId?.slice(0, 8) || 'NULL'} profile=${t.profileId?.slice(0, 8) || 'NULL'} title="${t.title}"`)
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
