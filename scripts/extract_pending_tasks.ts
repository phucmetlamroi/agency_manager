
import { PrismaClient } from '@prisma/client'
import fs from 'fs'

const prisma = new PrismaClient()

async function main() {
    const tasks = await prisma.task.findMany({
        where: {
            OR: [
                { status: 'Đang đợi giao' },
                { status: 'PENDING' } // Just in case of legacy data
            ]
        },
        include: {
            client: { select: { name: true, parent: { select: { name: true } } } },
            assignee: { select: { username: true } },
            project: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' }
    })

    console.log(`Found ${tasks.length} pending tasks.`)

    let markdown = '# Pending Tasks Report\n\n'
    markdown += `Generated at: ${new Date().toLocaleString()}\n\n`
    markdown += '| ID | Title | Status | Client | Deadline | Value (VND) | Job Price ($) | Resources | Notes |\n'
    markdown += '|---|---|---|---|---|---|---|---|---|\n'

    tasks.forEach(t => {
        const clientName = t.client ? (t.client.parent ? `${t.client.parent.name} > ${t.client.name}` : t.client.name) : 'N/A'
        const deadline = t.deadline ? t.deadline.toISOString().split('T')[0] : 'No Deadline'
        const value = t.value ? t.value.toLocaleString() : '0'
        const notes = t.notes ? t.notes.replace(/\n/g, ' ') : ''

        markdown += `| ${t.id} | ${t.title} | ${t.status} | ${clientName} | ${deadline} | ${value} | ${t.jobPriceUSD} | ${t.resources ? 'Yes' : 'No'} | ${notes} |\n`
    })

    // Also dumping raw JSON for full details if needed
    markdown += '\n## Raw JSON Data\n```json\n'
    markdown += JSON.stringify(tasks, null, 2)
    markdown += '\n```'

    fs.writeFileSync('pending_tasks_export.md', markdown)
    console.log('Exported to pending_tasks_export.md')
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
