/**
 * Probe 2 task Jacob/Kash Timeline 6 + 7 (Resolve) ở status `Revision`
 * nhưng deadline KHÔNG bị clear (UI screenshot 28-05).
 *
 * Hypothesis:
 * 1. Status đổi sang Revision QUA path không trigger restrictedStatuses logic
 *    (vd bulkUpdateStatus drag-drop, raw prisma.task.update từ admin tools,
 *    hoặc Sprint Q.1b bulkUpdateTaskStatus có bug)
 * 2. Task được seed/migrate trực tiếp với status='Revision' kèm deadline
 * 3. updateTask superadmin path skip Sprint A restrictedStatuses guard
 *
 * Plan:
 * - Find 2 task by title pattern
 * - Print full state + audit log timeline
 * - Identify when status → Revision happened + actor + path
 */

import { prisma } from '../src/lib/db'

async function main() {
    console.log('═'.repeat(78))
    console.log('PROBE — Jacob / Kash · Timeline 6 + 7 (Resolve) deadline-not-cleared')
    console.log('═'.repeat(78))

    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { title: { contains: 'Jacob', mode: 'insensitive' } },
                { title: { contains: 'Kash', mode: 'insensitive' } },
            ],
            AND: [
                {
                    OR: [
                        { title: { contains: 'Timeline 6' } },
                        { title: { contains: 'Timeline 7' } },
                    ],
                },
            ],
        },
        select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            productLink: true,
            assigneeId: true,
            assignedById: true,
            workspaceId: true,
            createdAt: true,
            updatedAt: true,
            version: true,
            isArchived: true,
            assignee: { select: { username: true, displayName: true } },
            assignedBy: { select: { username: true, displayName: true } },
            workspace: { select: { name: true, profileId: true } },
        },
    })

    if (tasks.length === 0) {
        console.log('❌ KHÔNG tìm thấy task nào match. Thử search rộng hơn...')
        const wide = await prisma.task.findMany({
            where: { title: { contains: 'Timeline', mode: 'insensitive' } },
            select: { id: true, title: true, status: true, deadline: true },
            take: 20,
        })
        console.log(`\nWide search "Timeline": ${wide.length} matches`)
        for (const t of wide) {
            console.log(
                `  ${t.id.slice(0, 8)} ${t.status.padEnd(15)} deadline=${t.deadline?.toISOString().slice(0, 10) || 'null'} | ${t.title}`,
            )
        }
        return
    }

    console.log(`\n✓ Found ${tasks.length} matching task(s):\n`)

    for (const t of tasks) {
        console.log('─'.repeat(78))
        console.log(`📍 ${t.title}`)
        console.log(`   ID:           ${t.id}`)
        console.log(`   Status:       ${t.status}`)
        console.log(`   Deadline:     ${t.deadline?.toISOString() ?? 'null'}  ${t.deadline ? '⚠️ NOT CLEARED' : '✓ cleared'}`)
        console.log(`   ProductLink:  ${t.productLink || '(empty)'}`)
        console.log(`   Assignee:     ${t.assignee?.displayName || t.assignee?.username || '(none)'} (id=${t.assigneeId?.slice(0, 8)})`)
        console.log(`   AssignedBy:   ${t.assignedBy?.displayName || t.assignedBy?.username || '(none)'} (id=${t.assignedById?.slice(0, 8)})`)
        console.log(`   Workspace:    ${t.workspace?.name} (id=${t.workspaceId?.slice(0, 8) ?? '?'})`)
        console.log(`   Version:      ${t.version}`)
        console.log(`   Created:      ${t.createdAt.toISOString().slice(0, 16)}`)
        console.log(`   Updated:      ${t.updatedAt.toISOString().slice(0, 16)}`)
        console.log(`   Archived:     ${t.isArchived}`)

        // Pull audit log
        const audits = await prisma.auditLog.findMany({
            where: { targetId: t.id },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                action: true,
                userId: true,
                createdAt: true,
                beforeData: true,
                afterData: true,
                user: { select: { username: true, displayName: true } },
            },
        })

        console.log(`\n   📜 Audit log (${audits.length} entries):`)
        if (audits.length === 0) {
            console.log('      (no audit entries — task có thể tạo trước khi audit system live)')
        }
        for (const a of audits) {
            const actor = a.user?.displayName || a.user?.username || (a.userId ? `userId=${a.userId.slice(0, 8)}` : 'SYSTEM')
            const beforeStr = a.beforeData ? JSON.stringify(a.beforeData).slice(0, 120) : ''
            const afterStr = a.afterData ? JSON.stringify(a.afterData).slice(0, 120) : ''
            console.log(
                `      ${a.createdAt.toISOString().slice(0, 19)} | ${a.action.padEnd(28)} | by ${actor}`,
            )
            if (beforeStr) console.log(`        before: ${beforeStr}`)
            if (afterStr) console.log(`        after:  ${afterStr}`)
        }

        // Verify Sprint A invariant (Revision should have deadline=null)
        const invariantOk =
            t.status !== 'Revision' && t.status !== 'Tạm ngưng' ? true : t.deadline === null
        console.log(`\n   ✓ Sprint A invariant (Revision/Tạm ngưng → deadline=null): ${invariantOk ? 'OK' : '❌ VIOLATED'}`)
    }

    console.log('\n' + '═'.repeat(78))
    console.log('ANALYSIS')
    console.log('═'.repeat(78))

    // Cross-check: any OTHER tasks in workspace with Revision + deadline set
    if (tasks[0]?.workspaceId) {
        const moreViolations = await prisma.task.count({
            where: {
                workspaceId: tasks[0].workspaceId,
                status: { in: ['Revision', 'Tạm ngưng'] },
                deadline: { not: null },
                isArchived: false,
            },
        })
        console.log(
            `\nTotal tasks in workspace "${tasks[0].workspace?.name}" có status Revision/Tạm ngưng nhưng deadline KHÔNG null: ${moreViolations}`,
        )

        if (moreViolations > 0 && tasks[0].workspaceId) {
            const list = await prisma.task.findMany({
                where: {
                    workspaceId: tasks[0].workspaceId,
                    status: { in: ['Revision', 'Tạm ngưng'] },
                    deadline: { not: null },
                    isArchived: false,
                },
                select: { id: true, title: true, status: true, deadline: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take: 50,
            })
            console.log('\nAll violations:')
            for (const t of list) {
                console.log(
                    `  ${t.id.slice(0, 8)} ${t.status.padEnd(10)} deadline=${t.deadline?.toISOString().slice(0, 10)} | ${t.title}`,
                )
            }
        }
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
