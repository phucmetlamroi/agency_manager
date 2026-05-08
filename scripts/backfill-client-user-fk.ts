/**
 * Backfill User.clientId — link CLIENT-role users → Client records.
 *
 * Audit fix #3.6: Trước đây client-portal-actions.ts match bằng
 * `client.name === user.username || user.nickname` → collision-prone.
 *
 * Script này:
 * 1. Tìm tất cả User có role=CLIENT, clientId IS NULL
 * 2. Match với Client where name = username OR nickname
 * 3. Set User.clientId nếu match unique
 * 4. Nếu match >1 (collision) → log warning, không tự gán
 *
 * Idempotent: chỉ scan user clientId IS NULL.
 *
 * Usage: npx tsx scripts/backfill-client-user-fk.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🔄 Backfill User.clientId cho CLIENT-role users\n')

    const clientUsers = await prisma.user.findMany({
        where: {
            role: 'CLIENT',
            clientId: null,
        } as any,
        select: { id: true, username: true, nickname: true },
    })

    console.log(`📊 Tổng số CLIENT users chưa link: ${clientUsers.length}\n`)

    let linked = 0
    let collisions = 0
    let unmatched = 0
    const collisionDetails: string[] = []

    for (const u of clientUsers) {
        const matchTerms = [u.username, u.nickname].filter(Boolean) as string[]
        if (matchTerms.length === 0) {
            unmatched++
            continue
        }

        const candidates = await prisma.client.findMany({
            where: {
                OR: matchTerms.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })),
            },
            select: { id: true, name: true, parentId: true },
        })

        if (candidates.length === 0) {
            unmatched++
            continue
        }

        if (candidates.length > 1) {
            // Collision — multiple Client records match. Prefer ROOT (parentId=null).
            const roots = candidates.filter((c) => c.parentId === null)
            if (roots.length === 1) {
                await prisma.user.update({
                    where: { id: u.id },
                    data: { clientId: roots[0].id } as any,
                })
                linked++
                console.log(`   ✓ ${u.username} → Client #${roots[0].id} (root match, picked from ${candidates.length} candidates)`)
                continue
            }

            collisions++
            collisionDetails.push(
                `   • ${u.username}: ${candidates.length} matches — ${candidates.map((c) => `#${c.id}(${c.name})`).join(', ')}`,
            )
            continue
        }

        // Unique match → safe link
        await prisma.user.update({
            where: { id: u.id },
            data: { clientId: candidates[0].id } as any,
        })
        linked++
    }

    console.log(`\n✅ Hoàn tất:`)
    console.log(`   Linked successfully: ${linked}`)
    console.log(`   Collisions (cần xử lý thủ công): ${collisions}`)
    console.log(`   Unmatched (no Client record): ${unmatched}`)

    if (collisionDetails.length > 0) {
        console.log(`\n⚠️  COLLISIONS:`)
        for (const d of collisionDetails) console.log(d)
        console.log('\n→ Xử lý thủ công bằng SQL:')
        console.log('  UPDATE "User" SET "clientId" = <correct_client_id> WHERE id = \'<user_id>\';')
    }

    console.log('\n💡 Verify:')
    console.log('  SELECT COUNT(*) FROM "User" WHERE role=\'CLIENT\' AND "clientId" IS NULL;')
}

main()
    .catch((e) => {
        console.error('❌ Backfill thất bại:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
