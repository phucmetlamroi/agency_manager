/**
 * [Sprint Z] Backfill ProfileAccess.role cho data hiện có.
 *
 * Logic per profile P:
 *   1. Identify designated OWNER (from mapping table — based on Sprint Z probe)
 *   2. For each User with User.profileId === P.id (home users):
 *      - If user.id === designated owner → upsert ProfileAccess(role=OWNER)
 *      - Else → upsert ProfileAccess(role=USER)
 *   3. For existing ProfileAccess rows (cross-team grants):
 *      - If user.id === designated owner → update role=OWNER
 *      - Else → update role=USER (default already, just ensure)
 *
 * Idempotent: upsert pattern. Re-runnable safely.
 *
 * Usage:
 *   npx tsx scripts/sprint-z-backfill-profile-roles.ts           # apply
 *   npx tsx scripts/sprint-z-backfill-profile-roles.ts --dry-run # preview only
 */

import { PrismaClient, ProfileRole } from '@prisma/client'
const prisma = new PrismaClient()

const DRY_RUN = process.argv.includes('--dry-run')

// OWNER mapping per Sprint Z probe (manual confirm by user):
// profileId(8) → { ownerUserId(8), label } for transparency
const OWNER_MAPPING: Record<string, { ownerHint: string; label: string }> = {
    '61f25775': { ownerHint: 'Bảo Phúc', label: 'Hustly Team' },
    '194c0015': { ownerHint: 'Trung Kiên', label: 'Carpe Diem' },
    '0199089f': { ownerHint: 'Vincent', label: 'Kẻ Cô Độc' },
    '9cd68695': { ownerHint: 'Kozhi', label: 'Kozhi Revenue' },
    '424debc1': { ownerHint: 'tobi.ndc', label: 'Tobi' },
    '6b36303f': { ownerHint: 'For dev', label: 'Testing' },
    '61e9259e': { ownerHint: 'solivor', label: 'Solivor' },
    'acd826b0': { ownerHint: 'Audrey Do', label: 'Audrey' },
    '9eb48bd2': { ownerHint: 'vanhau01', label: 'Flow Studio' },
    'a45b6312': { ownerHint: 'Dark', label: "Testing's Profile" },
    '73d499dc': { ownerHint: 'Ngọc Nhi Trần', label: "Ngọc Nhi Trần's Profile" },
    'af86134b': { ownerHint: 'Nguyễn Lâm Phước', label: "Nguyễn Lâm Phước's Profile" },
    '748d745d': { ownerHint: 'tttttttttttt', label: "clone's Profile" },
    '657aaf2c': { ownerHint: 'Pullio', label: "Pullio's Profile" },
    '3f3c38d0': { ownerHint: 'Hoàng', label: "Hoàng's Profile" },
    '02683e63': { ownerHint: 'Phúc Kòi', label: 'Phúctudio' },
    '5f47c169': { ownerHint: 'Phúc Kòi', label: 'kkuk' },
    'e6c98bfc': { ownerHint: 'Bảo Phúc', label: 'Phúc stu' },
}

async function main() {
    console.log(`=== [Sprint Z] Backfill ProfileAccess.role ${DRY_RUN ? '(DRY-RUN)' : '(APPLY)'} ===\n`)

    const profiles = await prisma.profile.findMany({
        select: { id: true, name: true, createdAt: true },
    })

    console.log(`Tổng profiles: ${profiles.length}\n`)

    let totalOwnersSet = 0
    let totalUsersSet = 0
    let totalNewAccess = 0

    for (const p of profiles) {
        const shortId = p.id.slice(0, 8)
        const mapping = OWNER_MAPPING[shortId]

        if (!mapping) {
            console.log(`⚠️ "${p.name}" (id=${shortId}) — KHÔNG có trong mapping, skip.`)
            continue
        }

        // Find designated owner by hint (nickname/displayName/username match)
        const ownerCandidates = await prisma.user.findMany({
            where: {
                OR: [
                    { nickname: mapping.ownerHint },
                    { displayName: mapping.ownerHint },
                    { username: mapping.ownerHint },
                ],
            },
            select: { id: true, username: true, nickname: true, displayName: true, profileId: true },
        })

        // Disambiguate: prefer user with home profile == this profile OR with ProfileAccess to this profile
        let ownerUser = ownerCandidates.find((u) => u.profileId === p.id)
        if (!ownerUser) {
            const access = await prisma.profileAccess.findFirst({
                where: { profileId: p.id, userId: { in: ownerCandidates.map((u) => u.id) } },
            })
            ownerUser = access ? ownerCandidates.find((u) => u.id === access.userId) : ownerCandidates[0]
        }

        if (!ownerUser) {
            console.log(`❌ "${p.name}" — KHÔNG tìm thấy user "${mapping.ownerHint}", skip.`)
            continue
        }

        console.log(`\n📁 "${p.name}" (id=${shortId})`)
        console.log(`   👑 OWNER: ${ownerUser.nickname ?? ownerUser.displayName ?? ownerUser.username} (id=${ownerUser.id.slice(0, 8)})`)

        // Get all home users (User.profileId = P.id)
        const homeUsers = await prisma.user.findMany({
            where: { profileId: p.id },
            select: { id: true, username: true, nickname: true, createdAt: true },
        })

        // Get existing ProfileAccess rows
        const existingAccess = await prisma.profileAccess.findMany({
            where: { profileId: p.id },
            select: { userId: true, role: true },
        })
        const existingMap = new Map(existingAccess.map((a) => [a.userId, a.role]))

        // Combine: home users + access users (deduped)
        const allUserIds = new Set<string>([...homeUsers.map((u) => u.id), ...existingAccess.map((a) => a.userId)])

        let ownerSet = 0
        let userSet = 0
        let newRows = 0

        for (const uid of allUserIds) {
            const desiredRole: ProfileRole = uid === ownerUser.id ? 'OWNER' : 'USER'
            const currentRole = existingMap.get(uid)

            if (currentRole === desiredRole) {
                // No change needed
                continue
            }

            if (!DRY_RUN) {
                if (existingMap.has(uid)) {
                    // Update existing
                    await prisma.profileAccess.update({
                        where: { userId_profileId: { userId: uid, profileId: p.id } },
                        data: { role: desiredRole },
                    })
                } else {
                    // Create new — backdate grantedAt cho home users để Admin cutoff không lock workspace cũ
                    const homeUser = homeUsers.find((u) => u.id === uid)
                    await prisma.profileAccess.create({
                        data: {
                            userId: uid,
                            profileId: p.id,
                            role: desiredRole,
                            grantedAt: homeUser?.createdAt ?? p.createdAt,
                        },
                    })
                    newRows++
                }
            }

            if (desiredRole === 'OWNER') ownerSet++
            else userSet++
        }

        console.log(`   📊 Changes: ${ownerSet} → OWNER, ${userSet} → USER (${newRows} new rows)`)
        totalOwnersSet += ownerSet
        totalUsersSet += userSet
        totalNewAccess += newRows
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 SUMMARY: ${totalOwnersSet} OWNER assignments, ${totalUsersSet} USER assignments, ${totalNewAccess} new ProfileAccess rows`)

    if (DRY_RUN) {
        console.log(`\n💡 Dry-run mode. Re-run without --dry-run để apply.`)
    } else {
        console.log(`\n✅ Backfill complete.`)
    }
}

main().catch(console.error).finally(() => prisma.$disconnect())
