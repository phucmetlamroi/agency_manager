// Audit User table: detect duplicate emails (case-insensitive) + report
// the "loser" accounts for each duplicate group so admin can decide how to
// merge or rename them.
//
// READ-ONLY — does not modify anything. Run locally with the production
// DATABASE_URL set in .env.
//
// Usage:
//   node scripts/audit-duplicate-emails.mjs
//   node scripts/audit-duplicate-emails.mjs --json    (machine-readable output)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const asJson = process.argv.includes('--json')

function pickWinner(rows) {
    // Match the same ordering as src/lib/user-lookup.ts so the audit's "winner"
    // = the row the runtime would pick in a duplicate situation. Stable.
    return [...rows].sort((a, b) => {
        const av = a.emailVerified ? 1 : 0
        const bv = b.emailVerified ? 1 : 0
        if (av !== bv) return bv - av
        const ag = a.googleId ? 1 : 0
        const bg = b.googleId ? 1 : 0
        if (ag !== bg) return bg - ag
        const al = a.lastLoginAt ? a.lastLoginAt.getTime() : 0
        const bl = b.lastLoginAt ? b.lastLoginAt.getTime() : 0
        if (al !== bl) return bl - al
        return b.createdAt.getTime() - a.createdAt.getTime()
    })[0]
}

async function main() {
    // Postgres group-by lower(email) — using $queryRaw to do the heavy lifting
    // server-side instead of fetching every user.
    const dupes = await prisma.$queryRaw`
        SELECT LOWER(email) AS lowered, COUNT(*)::int AS n
        FROM "User"
        WHERE email IS NOT NULL AND TRIM(email) <> ''
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
        ORDER BY n DESC, lowered ASC
    `

    if (dupes.length === 0) {
        if (asJson) console.log(JSON.stringify({ duplicateGroups: 0, totalExtraRows: 0, groups: [] }))
        else console.log('No duplicate emails. Safe to add `@@unique([email])` to schema.')
        return
    }

    const groups = []
    let totalExtra = 0

    for (const d of dupes) {
        const rows = await prisma.user.findMany({
            where: { email: { equals: d.lowered, mode: 'insensitive' } },
            select: {
                id: true,
                email: true,
                username: true,
                googleId: true,
                emailVerified: true,
                lastLoginAt: true,
                createdAt: true,
                role: true,
                _count: {
                    select: {
                        workspaces: true,
                        profileAccesses: true,
                    },
                },
            },
        })
        const winner = pickWinner(rows)
        totalExtra += rows.length - 1

        groups.push({
            email: d.lowered,
            n: d.n,
            winnerId: winner.id,
            users: rows.map(r => ({
                id: r.id,
                username: r.username,
                email: r.email,
                emailVerified: r.emailVerified,
                hasGoogleId: !!r.googleId,
                lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
                role: r.role,
                workspaces: r._count.workspaces,
                profileAccesses: r._count.profileAccesses,
                isWinner: r.id === winner.id,
            })),
        })
    }

    if (asJson) {
        console.log(JSON.stringify({
            duplicateGroups: groups.length,
            totalExtraRows: totalExtra,
            groups,
        }, null, 2))
        return
    }

    console.log(`\n=== DUPLICATE EMAIL AUDIT ===`)
    console.log(`Found ${groups.length} duplicate groups, ${totalExtra} "loser" rows to consolidate.\n`)

    for (const g of groups) {
        console.log(`▸ Email: ${g.email}  (${g.n} accounts)`)
        for (const u of g.users) {
            const tag = u.isWinner ? '★ WINNER' : '  loser '
            const flags = [
                u.hasGoogleId ? 'google' : 'pwd',
                u.emailVerified ? 'verified' : 'unverified',
                u.role,
            ].join(' · ')
            const activity = [
                `ws=${u.workspaces}`,
                `pa=${u.profileAccesses}`,
                u.lastLoginAt ? `lastLogin=${u.lastLoginAt.slice(0, 10)}` : 'never_logged_in',
            ].join(' · ')
            console.log(`   ${tag} ${u.username.padEnd(20)} id=${u.id.slice(0, 8)}…  [${flags}]  ${activity}`)
        }
        console.log('')
    }

    console.log(`\nRecommended actions:`)
    console.log(`  1. For each group, decide if losers should be MERGED into winner or RENAMED (email cleared).`)
    console.log(`  2. Merge: move workspaces, profileAccesses, tasks (assigneeId, clientUserId), invoices, etc.`)
    console.log(`  3. After merge, set loser.email = NULL or delete loser row.`)
    console.log(`  4. Once all groups are 0, add @@unique([email]) to schema.prisma + db push.`)
    console.log(`\n(Currently runtime defends via findUserByEmailOrUsername — picks winner consistently — so invites work correctly even before merge.)`)
}

main()
    .catch(e => { console.error('Error:', e.message); process.exit(1) })
    .finally(() => prisma.$disconnect())
