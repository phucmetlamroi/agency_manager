/**
 * Auth Phase 1 — Backfill displayName + email migration cho user cũ.
 *
 * Phân loại 3 nhóm theo §10.2 spec (login.md):
 *   - Nhóm A: User.email đã valid → mark hasCompletedEmailMigration = true
 *   - Nhóm B: User.username là email valid (vd "user@gmail.com") → copy sang email field
 *   - Nhóm C: User.username là tiếng Việt có dấu / không phải email → chỉ set displayName,
 *            user phải nhập email khi login lần tới (qua EmailMigrationModal Phase 3)
 *
 * Tất cả user đều set displayName = COALESCE(displayName, nickname, username)
 *
 * Idempotent: chạy nhiều lần không hỏng data.
 *   - Skip user đã hasCompletedEmailMigration = true
 *   - Skip nếu displayName đã được set
 *
 * Usage: npx tsx scripts/backfill-auth-fields.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Simple email regex (RFC 5322 lite — không cần exact, chỉ filter)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

function isValidEmail(s: string | null | undefined): boolean {
    if (!s) return false
    return EMAIL_REGEX.test(s.trim())
}

async function main() {
    console.log('🔄 Auth Phase 1 — Backfill displayName + email migration\n')

    const users = await prisma.user.findMany({
        where: { hasCompletedEmailMigration: false },
        select: {
            id: true,
            username: true,
            email: true,
            nickname: true,
            displayName: true,
        },
        orderBy: { createdAt: 'asc' },
    })

    console.log(`📊 Tổng số user cần xử lý: ${users.length}\n`)

    let countA = 0
    let countB = 0
    let countC = 0
    let skipped = 0
    const conflicts: Array<{ id: string; username: string; reason: string }> = []

    for (const u of users) {
        // Compute displayName fallback (giữ Unicode tiếng Việt có dấu)
        const newDisplayName = u.displayName ?? u.nickname ?? u.username

        // ── Nhóm A: User.email đã valid ──
        if (isValidEmail(u.email)) {
            await prisma.user.update({
                where: { id: u.id },
                data: {
                    hasCompletedEmailMigration: true,
                    displayName: newDisplayName,
                    // emailVerified vẫn = false; user phải verify lần đầu hoặc skip nếu admin trust
                },
            })
            countA++
            continue
        }

        // ── Nhóm B: username trông như email → copy sang email field ──
        if (isValidEmail(u.username)) {
            // Check email không trùng với user khác
            const existing = await prisma.user.findFirst({
                where: {
                    email: u.username,
                    id: { not: u.id },
                },
                select: { id: true },
            })

            if (existing) {
                conflicts.push({
                    id: u.id,
                    username: u.username,
                    reason: `username ${u.username} đã tồn tại làm email của user khác (id=${existing.id})`,
                })
                // Vẫn set displayName, nhưng không tự gán email
                await prisma.user.update({
                    where: { id: u.id },
                    data: { displayName: newDisplayName },
                })
                continue
            }

            await prisma.user.update({
                where: { id: u.id },
                data: {
                    email: u.username.trim().toLowerCase(),
                    hasCompletedEmailMigration: true,
                    displayName: newDisplayName,
                },
            })
            countB++
            continue
        }

        // ── Nhóm C: username Việt có dấu / không phải email ──
        // Chỉ set displayName; user sẽ phải nhập email khi login (qua EmailMigrationModal)
        await prisma.user.update({
            where: { id: u.id },
            data: { displayName: newDisplayName },
        })
        countC++
    }

    // ── Skipped users (đã hasCompletedEmailMigration = true) ──
    skipped = await prisma.user.count({ where: { hasCompletedEmailMigration: true } }) - countA - countB

    // ── Report ──
    console.log('✅ Hoàn tất backfill:')
    console.log(`   Nhóm A (email đã valid):                         ${countA}`)
    console.log(`   Nhóm B (username là email, copy sang email):     ${countB}`)
    console.log(`   Nhóm C (username Việt, đợi user nhập email):     ${countC}`)
    console.log(`   Đã hoàn tất từ trước (skipped):                   ${skipped}`)

    if (conflicts.length > 0) {
        console.log(`\n⚠️  CONFLICTS — ${conflicts.length} user cần xử lý thủ công:`)
        for (const c of conflicts) {
            console.log(`   • [${c.id}] ${c.username} → ${c.reason}`)
        }
        console.log('\n→ Các user này vẫn có displayName, nhưng phải nhập email mới qua login modal.')
    }

    console.log('\n💡 Lần chạy tiếp theo: chỉ những user nhóm C còn lại + user mới hasCompletedEmailMigration=false sẽ được scan.\n')
}

main()
    .catch((e) => {
        console.error('❌ Backfill thất bại:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
