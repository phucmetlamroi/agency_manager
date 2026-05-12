/**
 * Debug Sprint Y bug: Phúc Kòi tạo được workspace ở Hustly Team
 * nhưng KHÔNG tạo được ở Kẻ Cô Độc — inconsistency.
 *
 * Mục tiêu: hiểu schema thực tế của Phúc Kòi
 *   - User.profileId trỏ tới profile nào?
 *   - Có những ProfileAccess rows nào?
 *   - Hustly Team vs Kẻ Cô Độc khác gì?
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Debug Sprint Y: Phúc Kòi profile permissions ===\n')

    // Find Phúc Kòi user
    const users = await prisma.user.findMany({
        where: {
            OR: [
                { nickname: { contains: 'Phúc Kòi' } },
                { displayName: { contains: 'Phúc Kòi' } },
                { username: { contains: 'phuc' } },
                { username: { contains: 'koi' } },
            ],
        },
        select: {
            id: true,
            username: true,
            nickname: true,
            displayName: true,
            profileId: true,
            role: true,
        },
    })

    console.log(`Tìm thấy ${users.length} user match:\n`)
    for (const u of users) {
        console.log(`  • id=${u.id.slice(0, 8)} username="${u.username}" nickname="${u.nickname}" displayName="${u.displayName}"`)
        console.log(`    role=${u.role}, profileId=${u.profileId?.slice(0, 8) ?? 'NULL'}`)
    }

    // Phúc Kòi (best guess)
    const phucKoi = users.find((u) => u.nickname === 'Phúc Kòi' || u.displayName === 'Phúc Kòi')
    if (!phucKoi) {
        console.log('\n❌ Không tìm thấy chính xác Phúc Kòi. Stop.')
        return
    }

    console.log(`\n=== Phúc Kòi (id=${phucKoi.id.slice(0, 8)}) ===\n`)

    // Home profile (User.profileId)
    if (phucKoi.profileId) {
        const homeProfile = await prisma.profile.findUnique({
            where: { id: phucKoi.profileId },
            select: { id: true, name: true },
        })
        console.log(`📍 Home profile: "${homeProfile?.name}" (id=${homeProfile?.id.slice(0, 8)})`)
    } else {
        console.log(`📍 Home profile: NULL`)
    }

    // All ProfileAccess rows (cross-team grants)
    const accesses = await prisma.profileAccess.findMany({
        where: { userId: phucKoi.id },
        select: {
            profileId: true,
            grantedAt: true,
            profile: { select: { name: true } },
        },
    })
    console.log(`\n📋 ProfileAccess rows (${accesses.length}):`)
    for (const a of accesses) {
        console.log(`  • "${a.profile?.name}" (id=${a.profileId.slice(0, 8)}) — granted ${a.grantedAt.toISOString().slice(0, 10)}`)
    }

    // Find Hustly Team + Kẻ Cô Độc profiles
    const profiles = await prisma.profile.findMany({
        where: {
            OR: [
                { name: { contains: 'Hustly' } },
                { name: { contains: 'Kẻ Cô' } },
            ],
        },
        select: { id: true, name: true, createdAt: true },
    })
    console.log(`\n🏢 Profiles tìm thấy:`)
    for (const p of profiles) {
        console.log(`  • "${p.name}" (id=${p.id.slice(0, 8)}) — created ${p.createdAt.toISOString().slice(0, 10)}`)
    }

    // Compare: is Phúc Kòi's profileId === Hustly Team?
    const hustlyTeam = profiles.find((p) => p.name?.includes('Hustly'))
    const keCoDoc = profiles.find((p) => p.name?.includes('Kẻ Cô'))

    console.log('\n=== ANALYSIS ===\n')

    if (hustlyTeam) {
        const match = phucKoi.profileId === hustlyTeam.id
        console.log(`Phúc Kòi.profileId === Hustly Team.id?  ${match ? '✅ YES (home owner)' : '❌ NO (cross-team only)'}`)
        if (match) {
            console.log(`  → Sprint Y ALLOW vì Phúc Kòi là chủ home profile của Hustly Team.`)
            console.log(`  → Nhưng user spec: Phúc Kòi có role "User" tại Hustly Team → BLOCK.`)
            console.log(`  → BUG: Sprint Y dùng heuristic User.profileId, không match khái niệm "role trong profile".`)
        }
        // Check workspace memberships of Phúc Kòi in Hustly Team workspaces
        const wsInHustly = await prisma.workspace.findMany({
            where: { profileId: hustlyTeam.id },
            select: {
                id: true, name: true,
                members: {
                    where: { userId: phucKoi.id },
                    select: { role: true },
                },
            },
        })
        console.log(`\n  Hustly Team workspaces (${wsInHustly.length}):`)
        for (const ws of wsInHustly) {
            const role = ws.members[0]?.role ?? 'NOT MEMBER'
            console.log(`    • "${ws.name}" — Phúc Kòi role: ${role}`)
        }
    }

    if (keCoDoc) {
        const match = phucKoi.profileId === keCoDoc.id
        console.log(`\nPhúc Kòi.profileId === Kẻ Cô Độc.id? ${match ? '✅ YES (home owner)' : '❌ NO (cross-team only)'}`)
        const wsInKeCoDoc = await prisma.workspace.findMany({
            where: { profileId: keCoDoc.id },
            select: {
                id: true, name: true,
                members: {
                    where: { userId: phucKoi.id },
                    select: { role: true },
                },
            },
        })
        console.log(`  Kẻ Cô Độc workspaces (${wsInKeCoDoc.length}):`)
        for (const ws of wsInKeCoDoc) {
            const role = ws.members[0]?.role ?? 'NOT MEMBER'
            console.log(`    • "${ws.name}" — Phúc Kòi role: ${role}`)
        }
    }

    // Total: how many users have User.profileId pointing to "Hustly Team"?
    if (hustlyTeam) {
        const usersInHustly = await prisma.user.findMany({
            where: { profileId: hustlyTeam.id },
            select: { id: true, username: true, nickname: true, displayName: true },
        })
        console.log(`\n📊 Users với User.profileId === Hustly Team.id (${usersInHustly.length}):`)
        for (const u of usersInHustly) {
            console.log(`  • ${u.nickname ?? u.displayName ?? u.username}`)
        }
        console.log(`  → Tất cả user trên đều ĐƯỢC PHÉP tạo workspace ở Hustly Team theo Sprint Y rule.`)
        console.log(`  → User spec muốn chỉ Owner/Admin role mới được — cần REWRITE rule với role-based check.`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
