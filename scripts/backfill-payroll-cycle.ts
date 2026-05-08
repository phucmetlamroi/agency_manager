/**
 * Backfill PayrollLock + MonthlyBonus + MonthlyRank records.
 *
 * Trước đây code hardcode `month=0, year=0` cho mọi workspace → tất cả records
 * đều có {month:0, year:0, workspaceId}. Sau khi fix, code dùng month/year THỰC
 * extracted từ workspace.name format "MM / YYYY".
 *
 * Script này:
 * 1. Tìm tất cả workspace có name format "MM / YYYY"
 * 2. Update PayrollLock/MonthlyBonus/MonthlyRank của workspace đó:
 *    - Nếu month=0, year=0 → đổi thành month/year extracted
 *    - Nếu đã có month/year đúng → bỏ qua
 *
 * Idempotent: chạy nhiều lần không hỏng.
 *
 * Usage: npx tsx scripts/backfill-payroll-cycle.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function extractCycle(name: string | null | undefined): { month: number; year: number } | null {
    if (!name) return null
    const match = name.match(/(\d{1,2})\s*\/\s*(\d{4})/)
    if (!match) return null
    const month = parseInt(match[1], 10)
    const year = parseInt(match[2], 10)
    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2099) {
        return { month, year }
    }
    return null
}

async function main() {
    console.log('🔄 Backfill payroll cycle (month/year) cho data cũ\n')

    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true },
    })

    console.log(`📊 Tổng số workspaces: ${workspaces.length}\n`)

    let lockUpdated = 0
    let bonusUpdated = 0
    let rankUpdated = 0
    let skipped = 0
    const conflicts: string[] = []

    for (const ws of workspaces) {
        const cycle = extractCycle(ws.name)
        if (!cycle) {
            skipped++
            continue
        }

        // ── PayrollLock ──
        try {
            const lockResult = await prisma.payrollLock.updateMany({
                where: {
                    workspaceId: ws.id,
                    month: 0,
                    year: 0,
                },
                data: {
                    month: cycle.month,
                    year: cycle.year,
                },
            })
            lockUpdated += lockResult.count
        } catch (e: any) {
            // Có thể trùng unique key nếu đã có record (month, year, workspaceId)
            if (e?.code === 'P2002') {
                conflicts.push(`PayrollLock: workspace ${ws.id} (${ws.name}) đã có lock với month=${cycle.month}, year=${cycle.year}`)
            } else {
                console.error(`Lock update error for ${ws.id}:`, e.message)
            }
        }

        // ── MonthlyBonus ──
        try {
            const bonusResult = await prisma.monthlyBonus.updateMany({
                where: {
                    workspaceId: ws.id,
                    month: 0,
                    year: 0,
                },
                data: {
                    month: cycle.month,
                    year: cycle.year,
                },
            })
            bonusUpdated += bonusResult.count
        } catch (e: any) {
            if (e?.code === 'P2002') {
                conflicts.push(`MonthlyBonus: workspace ${ws.id} có duplicate`)
            }
        }

        // ── MonthlyRank ──
        try {
            const rankResult = await prisma.monthlyRank.updateMany({
                where: {
                    workspaceId: ws.id,
                    month: 0,
                    year: 0,
                },
                data: {
                    month: cycle.month,
                    year: cycle.year,
                },
            })
            rankUpdated += rankResult.count
        } catch (e: any) {
            if (e?.code === 'P2002') {
                conflicts.push(`MonthlyRank: workspace ${ws.id} có duplicate`)
            }
        }
    }

    console.log('✅ Hoàn tất backfill:')
    console.log(`   PayrollLock records updated:   ${lockUpdated}`)
    console.log(`   MonthlyBonus records updated:  ${bonusUpdated}`)
    console.log(`   MonthlyRank records updated:   ${rankUpdated}`)
    console.log(`   Workspaces không có format MM/YYYY (skipped): ${skipped}`)

    if (conflicts.length > 0) {
        console.log(`\n⚠️  CONFLICTS (cần xử lý thủ công):`)
        for (const c of conflicts) console.log(`   • ${c}`)
        console.log('\nNguyên nhân: workspace đã có records với cả (0,0) VÀ (month,year). Cần chọn 1.')
    }

    console.log('\n💡 Sau khi chạy script này, verify bằng SQL:')
    console.log('   SELECT month, year, COUNT(*) FROM "PayrollLock" GROUP BY 1, 2;')
    console.log('   → KHÔNG còn (month=0, year=0) cho workspaces có name format MM/YYYY.\n')
}

main()
    .catch((e) => {
        console.error('❌ Backfill thất bại:', e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
