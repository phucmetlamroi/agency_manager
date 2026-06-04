/**
 * Đếm số profile đang hoạt động trong tháng 5/2026 — định nghĩa "hoạt động":
 *   1. Tạo workspace mới trong tháng (primary metric — user yêu cầu)
 *   2. Có activity khác: tạo task, login (extra context)
 *
 * Lưu ý timezone: dùng Asia/Ho_Chi_Minh (+07:00) — start tháng 5 = 2026-05-01T00:00:00+07:00
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const monthStart = new Date('2026-05-01T00:00:00+07:00')
    const monthEnd = new Date('2026-06-01T00:00:00+07:00')
    const now = new Date()

    console.log('=== Profiles HOẠT ĐỘNG trong tháng 5/2026 ===')
    console.log(`Khoảng thời gian: ${monthStart.toISOString()} → ${monthEnd.toISOString()}`)
    console.log(`Hiện tại: ${now.toISOString()}\n`)

    // 1. Workspaces tạo mới trong tháng 5
    const newWorkspaces = await prisma.workspace.findMany({
        where: {
            createdAt: { gte: monthStart, lt: monthEnd },
        },
        select: {
            id: true,
            name: true,
            createdAt: true,
            profileId: true,
            profile: { select: { id: true, name: true } },
            members: {
                where: { role: 'OWNER' },
                select: { user: { select: { username: true, displayName: true, nickname: true } } },
                take: 1,
            },
        },
        orderBy: { createdAt: 'asc' },
    })

    console.log(`📊 Tổng workspace tạo mới trong tháng 5: ${newWorkspaces.length}\n`)

    if (newWorkspaces.length === 0) {
        console.log('(Chưa có workspace nào được tạo trong tháng 5/2026)')
    } else {
        console.log('Chi tiết:')
        for (const ws of newWorkspaces) {
            const profileName = ws.profile?.name ?? '(no profile)'
            const owner = ws.members[0]?.user
            const ownerDisplay = owner?.nickname ?? owner?.displayName ?? owner?.username ?? '(no owner)'
            console.log(`  • ${ws.createdAt.toISOString().slice(0, 10)} — "${ws.name}" (profile: ${profileName}, owner: ${ownerDisplay})`)
        }
    }

    // 2. Group by profile
    const profileSet = new Set<string>()
    const profileDetails = new Map<string, { name: string; wsCount: number }>()
    for (const ws of newWorkspaces) {
        if (ws.profileId) {
            profileSet.add(ws.profileId)
            const existing = profileDetails.get(ws.profileId)
            profileDetails.set(ws.profileId, {
                name: ws.profile?.name ?? '(unknown)',
                wsCount: (existing?.wsCount ?? 0) + 1,
            })
        }
    }

    console.log(`\n🎯 Số profile ĐANG HOẠT ĐỘNG (đã tạo workspace mới trong tháng): ${profileSet.size}\n`)
    if (profileSet.size > 0) {
        console.log('Danh sách profile:')
        for (const [pid, info] of profileDetails) {
            console.log(`  • ${info.name}  →  tạo ${info.wsCount} workspace mới  (profileId: ${pid.slice(0, 8)})`)
        }
    }

    // 3. Bonus: profile có activity khác (task, login)
    console.log('\n--- Bonus context ---')

    // Tasks tạo mới tháng 5
    const tasksThisMonth = await prisma.task.findMany({
        where: { createdAt: { gte: monthStart, lt: monthEnd } },
        select: { workspace: { select: { profileId: true, profile: { select: { name: true } } } } },
    })
    const profilesWithNewTasks = new Set<string>()
    const profileTaskNames = new Map<string, string>()
    for (const t of tasksThisMonth) {
        if (t.workspace?.profileId) {
            profilesWithNewTasks.add(t.workspace.profileId)
            if (t.workspace.profile?.name) profileTaskNames.set(t.workspace.profileId, t.workspace.profile.name)
        }
    }
    console.log(`📋 Profile có task tạo mới trong tháng: ${profilesWithNewTasks.size} (${tasksThisMonth.length} tasks)`)
    for (const pid of profilesWithNewTasks) {
        console.log(`  • ${profileTaskNames.get(pid) ?? pid.slice(0, 8)}`)
    }

    // Total profiles trong hệ thống
    const totalProfiles = await prisma.profile.count()
    console.log(`\n📈 Tổng profile trong hệ thống: ${totalProfiles}`)
    console.log(`📈 Tỷ lệ profile hoạt động tháng này (workspace mới): ${profileSet.size}/${totalProfiles} = ${((profileSet.size / totalProfiles) * 100).toFixed(1)}%`)
    console.log(`📈 Tỷ lệ profile hoạt động tháng này (task mới): ${profilesWithNewTasks.size}/${totalProfiles} = ${((profilesWithNewTasks.size / totalProfiles) * 100).toFixed(1)}%`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
