/**
 * Sprint Z prep: Identify natural OWNER candidate cho mỗi profile.
 *
 * Heuristic ranking để xác định "ai là chủ thật" của profile (sau khi admin
 * user bị xóa):
 *   1. User tạo nhiều workspace OWNER nhất trong profile (active leader)
 *   2. User tạo workspace ĐẦU TIÊN trong profile (original creator)
 *   3. Fallback: first user có ProfileAccess trong profile đó
 *
 * Output: bảng đề xuất OWNER mapping cho user confirm trước khi backfill.
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Sprint Z: Owner candidate audit per profile ===\n')

    // 1. List all profiles
    const profiles = await prisma.profile.findMany({
        select: {
            id: true,
            name: true,
            createdAt: true,
            _count: { select: { users: true, workspaces: true } },
        },
        orderBy: { createdAt: 'asc' },
    })

    console.log(`Tổng profiles: ${profiles.length}\n`)

    for (const p of profiles) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        console.log(`📁 "${p.name}" (id=${p.id.slice(0, 8)}, created ${p.createdAt.toISOString().slice(0, 10)})`)
        console.log(`   ${p._count.users} home users, ${p._count.workspaces} workspaces`)

        // Heuristic 1: count OWNER memberships in this profile's workspaces, grouped by user
        const ownerships = await prisma.workspaceMember.groupBy({
            by: ['userId'],
            where: {
                role: 'OWNER',
                workspace: { profileId: p.id },
            },
            _count: { workspaceId: true },
            orderBy: { _count: { workspaceId: 'desc' } },
        })

        if (ownerships.length === 0) {
            console.log(`   ⚠️ Không có user nào OWN workspace trong profile này.`)
        } else {
            const userIds = ownerships.map((o) => o.userId)
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, username: true, nickname: true, displayName: true, profileId: true },
            })
            const userMap = new Map(users.map((u) => [u.id, u]))

            console.log(`   👑 OWNER candidates (ranked):`)
            for (const o of ownerships) {
                const u = userMap.get(o.userId)
                const display = u?.nickname ?? u?.displayName ?? u?.username ?? '?'
                const isHome = u?.profileId === p.id
                console.log(`     • ${display} (id=${u?.id.slice(0, 8)}) — own ${o._count.workspaceId} workspace(s) ${isHome ? '[HOME]' : '[cross-team]'}`)
            }
        }

        // Heuristic 2: first workspace creator (earliest workspace.createdAt)
        const firstWs = await prisma.workspace.findFirst({
            where: { profileId: p.id },
            orderBy: { createdAt: 'asc' },
            select: {
                id: true,
                name: true,
                createdAt: true,
                members: {
                    where: { role: 'OWNER' },
                    select: {
                        user: {
                            select: { id: true, username: true, nickname: true, displayName: true },
                        },
                    },
                    take: 1,
                },
            },
        })
        if (firstWs) {
            const u = firstWs.members[0]?.user
            const display = u?.nickname ?? u?.displayName ?? u?.username ?? '?'
            console.log(`   🥇 Earliest workspace OWNER: ${display} ("${firstWs.name}" ${firstWs.createdAt.toISOString().slice(0, 10)})`)
        }

        // Heuristic 3: users với ProfileAccess
        const accesses = await prisma.profileAccess.findMany({
            where: { profileId: p.id },
            select: {
                grantedAt: true,
                user: { select: { id: true, username: true, nickname: true, displayName: true } },
            },
            orderBy: { grantedAt: 'asc' },
        })
        console.log(`   🔑 ProfileAccess rows (${accesses.length}):`)
        for (const a of accesses.slice(0, 5)) {
            const display = a.user.nickname ?? a.user.displayName ?? a.user.username ?? '?'
            console.log(`     • ${display} — granted ${a.grantedAt.toISOString().slice(0, 10)}`)
        }
        if (accesses.length > 5) console.log(`     ... +${accesses.length - 5} more`)
    }

    // 4. Summary: admin user info (sẽ bị xóa)
    console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log('🗑️ ADMIN USER (sẽ bị xóa)')
    const adminUser = await prisma.user.findFirst({
        where: { username: 'admin' },
        select: {
            id: true,
            email: true,
            role: true,
            profileId: true,
            _count: { select: { tasks: true } },
        },
    })
    if (adminUser) {
        const wsOwnerships = await prisma.workspaceMember.count({
            where: { userId: adminUser.id, role: 'OWNER' },
        })
        console.log(`  • id=${adminUser.id.slice(0, 8)}, email=${adminUser.email}`)
        console.log(`  • role=${adminUser.role}, profileId=${adminUser.profileId?.slice(0, 8) ?? 'NULL'}`)
        console.log(`  • OWNER ở ${wsOwnerships} workspace(s)`)
        console.log(`  • Assignee của ${adminUser._count.tasks} tasks`)
        console.log(`  ⚠️ Trước khi xóa: cần transfer ownership của ${wsOwnerships} workspace sang user khác.`)
    } else {
        console.log(`  Không tìm thấy admin user.`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
