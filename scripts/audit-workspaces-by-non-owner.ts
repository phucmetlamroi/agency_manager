/**
 * [Sprint Y] Audit script — informational only, KHÔNG auto-fix.
 *
 * Scan workspaces hiện có để tìm workspace nào tạo bởi user KHÔNG phải chủ home profile
 * của profile workspace thuộc về. Đây là pattern "vi phạm" sẽ bị block sau Sprint Y,
 * nhưng workspaces cũ (pre-Sprint Y) vẫn được giữ lại — user tự quyết định có xử lý không.
 *
 * Cách dò: với mỗi workspace, lấy OWNER (WorkspaceMember.role='OWNER') → so sánh
 * `owner.user.profileId` với `workspace.profileId`. Nếu khác → flag.
 *
 * Output: report dạng table — user decide có purge/transfer ownership không.
 *
 * Usage:
 *   npx tsx scripts/audit-workspaces-by-non-owner.ts
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== [Sprint Y] AUDIT: Workspaces tạo bởi non-owner ===\n')

    // Lấy tất cả workspaces + OWNER member + OWNER's user.profileId
    const workspaces = await prisma.workspace.findMany({
        select: {
            id: true,
            name: true,
            profileId: true,
            createdAt: true,
            profile: { select: { name: true } },
            members: {
                where: { role: 'OWNER' },
                select: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            nickname: true,
                            displayName: true,
                            profileId: true,
                        },
                    },
                },
                take: 1,
            },
        },
        orderBy: { createdAt: 'asc' },
    })

    console.log(`Tổng workspaces: ${workspaces.length}\n`)

    const violations: typeof workspaces = []
    let noOwner = 0

    for (const ws of workspaces) {
        const owner = ws.members[0]?.user
        if (!owner) {
            noOwner++
            continue
        }
        // Vi phạm: owner.profileId KHÁC workspace.profileId
        if (owner.profileId !== ws.profileId) {
            violations.push(ws)
        }
    }

    console.log(`Workspaces KHÔNG có OWNER (orphan): ${noOwner}`)
    console.log(`Workspaces tạo bởi NON-OWNER: ${violations.length}\n`)

    if (violations.length === 0) {
        console.log('✅ KHÔNG có violation. Tất cả workspaces có owner là chủ home profile.')
        return
    }

    console.log('⚠️ DANH SÁCH VI PHẠM:')
    console.log('─'.repeat(120))
    console.log('| Date       | Workspace                          | Profile                       | Owner (display)                     |')
    console.log('─'.repeat(120))

    for (const ws of violations) {
        const owner = ws.members[0]?.user
        const ownerDisplay = owner?.nickname ?? owner?.displayName ?? owner?.username ?? '?'
        const dateStr = ws.createdAt.toISOString().slice(0, 10)
        const wsName = (ws.name ?? '?').padEnd(35).slice(0, 35)
        const profName = (ws.profile?.name ?? '?').padEnd(30).slice(0, 30)
        const ownerStr = (ownerDisplay).padEnd(35).slice(0, 35)
        console.log(`| ${dateStr} | ${wsName} | ${profName} | ${ownerStr} |`)
    }
    console.log('─'.repeat(120))

    console.log(`\n📊 Tổng: ${violations.length} workspace(s) cần review.`)
    console.log('💡 Sprint Y BLOCK new creates kể từ giờ; workspaces cũ giữ nguyên cho safety.')
    console.log('   Nếu muốn xử lý: transfer ownership hoặc archive workspace thủ công.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
