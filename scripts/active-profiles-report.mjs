// Báo cáo: Profile nào thực sự hoạt động tháng này (June 2026)
// Run: node scripts/active-profiles-report.mjs
//
// Tín hiệu "active":
//   1. Có Task được tạo/update trong tháng này
//   2. Có User login trong tháng này
//   3. Có Invoice phát hành trong tháng này
//   4. Profile.status = ACTIVE (không soft-deleted)

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const now = new Date()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1)

const monthLabel = `${now.getMonth() + 1}/${now.getFullYear()}`

async function main() {
    console.log(`\n=== BÁO CÁO PROFILE HOẠT ĐỘNG — Tháng ${monthLabel} ===\n`)
    console.log(`Khoảng: ${monthStart.toISOString().slice(0, 10)} → ${monthEnd.toISOString().slice(0, 10)}\n`)

    // 1. Lấy tất cả profile ACTIVE
    const profiles = await prisma.profile.findMany({
        where: { status: 'ACTIVE' },
        select: {
            id: true,
            name: true,
            createdAt: true,
            users: {
                select: {
                    id: true,
                    username: true,
                    nickname: true,
                    displayName: true,
                    lastLoginAt: true,
                    role: true,
                }
            },
            workspaces: {
                where: { status: 'ACTIVE' },
                select: { id: true, name: true }
            },
            tasks: {
                where: {
                    OR: [
                        { createdAt: { gte: monthStart, lt: monthEnd } },
                        { updatedAt: { gte: monthStart, lt: monthEnd } },
                    ]
                },
                select: { id: true, status: true, updatedAt: true }
            },
            invoices: {
                where: {
                    issueDate: { gte: monthStart, lt: monthEnd }
                },
                select: { id: true, totalDue: true, status: true }
            }
        },
        orderBy: { createdAt: 'asc' }
    })

    if (profiles.length === 0) {
        console.log('Không có profile nào trong hệ thống.')
        return
    }

    // Phân loại
    const active = []
    const dormant = []

    for (const p of profiles) {
        const loginsThisMonth = p.users.filter(u => u.lastLoginAt && u.lastLoginAt >= monthStart && u.lastLoginAt < monthEnd)
        const taskCount = p.tasks.length
        const invoiceCount = p.invoices.length
        const loginCount = loginsThisMonth.length

        const isActive = taskCount > 0 || invoiceCount > 0 || loginCount > 0

        const summary = {
            id: p.id,
            name: p.name,
            wsCount: p.workspaces.length,
            userCount: p.users.length,
            taskCount,
            invoiceCount,
            loginCount,
            invoiceTotal: p.invoices.reduce((s, i) => s + Number(i.totalDue || 0), 0),
            recentLogin: loginsThisMonth.sort((a, b) => (b.lastLoginAt - a.lastLoginAt))[0],
            createdAt: p.createdAt,
        }

        if (isActive) active.push(summary)
        else dormant.push(summary)
    }

    // ──────────────────────────────────────────────────────────
    console.log(`✅ PROFILE HOẠT ĐỘNG (${active.length}/${profiles.length})\n`)

    if (active.length === 0) {
        console.log('   (Không có profile nào hoạt động tháng này.)\n')
    } else {
        for (const p of active) {
            console.log(`   ▸ ${p.name}`)
            console.log(`     ID: ${p.id}`)
            console.log(`     Workspaces: ${p.wsCount}   ·   Users: ${p.userCount}`)
            console.log(`     Tasks tháng này: ${p.taskCount}   ·   Invoices: ${p.invoiceCount}   ·   Login: ${p.loginCount}`)
            if (p.invoiceTotal > 0) console.log(`     Doanh thu invoice: $${p.invoiceTotal.toFixed(2)}`)
            if (p.recentLogin) {
                const name = p.recentLogin.displayName || p.recentLogin.nickname || p.recentLogin.username
                const when = p.recentLogin.lastLoginAt.toISOString().slice(0, 16).replace('T', ' ')
                console.log(`     Login gần nhất: ${name} · ${when}`)
            }
            console.log('')
        }
    }

    // ──────────────────────────────────────────────────────────
    console.log(`\n💤 PROFILE KHÔNG HOẠT ĐỘNG (${dormant.length}/${profiles.length})\n`)

    if (dormant.length === 0) {
        console.log('   (Tất cả profile đều có hoạt động tháng này.)\n')
    } else {
        for (const p of dormant) {
            const ageDays = Math.floor((now - p.createdAt) / 86400000)
            console.log(`   ▸ ${p.name.padEnd(35)} (tạo ${ageDays}d trước · ${p.wsCount} ws · ${p.userCount} users)`)
        }
    }

    // ──────────────────────────────────────────────────────────
    console.log(`\n📊 TỔNG KẾT`)
    console.log(`   Profile ACTIVE trong DB: ${profiles.length}`)
    console.log(`   Đang hoạt động tháng ${monthLabel}: ${active.length} (${Math.round(100 * active.length / profiles.length)}%)`)
    console.log(`   Tổng tasks tháng này: ${active.reduce((s, p) => s + p.taskCount, 0)}`)
    console.log(`   Tổng invoices tháng này: ${active.reduce((s, p) => s + p.invoiceCount, 0)}`)
    const totalRevenue = active.reduce((s, p) => s + p.invoiceTotal, 0)
    if (totalRevenue > 0) console.log(`   Tổng doanh thu invoice tháng này: $${totalRevenue.toFixed(2)}`)
    console.log('')
}

main()
    .catch(e => {
        console.error('Lỗi:', e.message)
        process.exit(1)
    })
    .finally(() => prisma.$disconnect())
