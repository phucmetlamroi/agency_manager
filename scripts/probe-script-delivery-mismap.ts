/**
 * Probe: find tasks bị ảnh hưởng bởi bug script → productLink mapping.
 *
 * AddTaskModal cho admin nhập field "Scription" (đáng lẽ là script link cho user
 * đọc). DashboardActionWrapper bug map sai sang `productLink` (delivery field).
 *
 * Identify tasks có productLink set ngay khi tạo (KHÔNG phải user submit):
 *   - status="Đang đợi giao" hoặc "Nhận task" hoặc "Đang thực hiện" + productLink set
 *   - User chưa nộp video nhưng productLink đã có → likely script bị mismap
 *
 * Plus tasks có fileLink set (B-roll bug — lost data, không hiện trong TaskDetailModal):
 *   - Any fileLink !== "" hoặc null
 */

import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    console.log('=== Probe: Script→Delivery mismap + B-roll lost data ===\n')

    // Bug 1: productLink set khi user chưa thực sự deliver
    const PRE_DELIVERY_STATUSES = ['Đang đợi giao', 'Nhận task', 'Đã nhận task', 'Đang thực hiện']
    const suspectScripts = await prisma.task.findMany({
        where: {
            productLink: { not: null },
            status: { in: PRE_DELIVERY_STATUSES },
            isArchived: false,
        },
        select: {
            id: true,
            title: true,
            status: true,
            productLink: true,
            createdAt: true,
            workspace: { select: { name: true, profile: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
    })

    console.log(`📋 Bug 1: Tasks có productLink (delivery) đã SET nhưng status chưa deliver`)
    console.log(`   (likely Script bị mismap thành productLink)`)
    console.log(`   Tổng: ${suspectScripts.length}\n`)
    if (suspectScripts.length > 0) {
        for (const t of suspectScripts.slice(0, 10)) {
            console.log(`   • "${t.title?.slice(0, 50)}"`)
            console.log(`     status=${t.status}, productLink="${t.productLink?.slice(0, 60)}"`)
            console.log(`     profile=${t.workspace?.profile?.name ?? '?'}, ws=${t.workspace?.name}`)
        }
        if (suspectScripts.length > 10) console.log(`   ... +${suspectScripts.length - 10} more`)
    }

    // Bug 2: fileLink set (B-roll mismap → TaskDetailModal không đọc → data lost)
    const fileLinks = await prisma.task.count({
        where: {
            fileLink: { not: null },
            isArchived: false,
        },
    })
    console.log(`\n📋 Bug 2: Tasks có fileLink set (B-roll bị mismap, lost trong TaskDetailModal)`)
    console.log(`   Tổng: ${fileLinks} tasks`)

    if (fileLinks > 0) {
        const sample = await prisma.task.findMany({
            where: { fileLink: { not: null }, isArchived: false },
            select: { id: true, title: true, fileLink: true, resources: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 5,
        })
        console.log(`\n   Sample (last 5):`)
        for (const t of sample) {
            console.log(`   • "${t.title?.slice(0, 50)}"`)
            console.log(`     fileLink="${t.fileLink?.slice(0, 60)}"`)
            console.log(`     resources="${t.resources?.slice(0, 80) ?? '<empty>'}"`)
        }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('Fix applied: DashboardActionWrapper.handleSubmit now packs correctly.')
    console.log('NEW tasks created sau fix sẽ store đúng format.')
    console.log('OLD tasks above có thể cần manual cleanup (Owner edit lại trong TaskDetailModal).')
}

main().catch(console.error).finally(() => prisma.$disconnect())
