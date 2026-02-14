
import { prisma } from '../src/lib/db'

async function main() {
    console.log('--- SYSTEM DATA REPORT ---')

    // 1. Get Clients
    const clients = await prisma.client.findMany({
        include: {
            _count: {
                select: {
                    tasks: { where: { invoiceStatus: 'UNBILLED' } },
                    invoices: true
                }
            }
        }
    })

    console.log(`\nFound ${clients.length} Clients:`)
    clients.forEach(c => {
        console.log(`- [${c.id}] ${c.name}`)
        console.log(`  Balance: $${c.depositBalance}`)
        console.log(`  Unbilled Tasks: ${c._count.tasks}`)
        console.log(`  Invoices: ${c._count.invoices}`)
    })

    // 2. Get Unbilled Tasks for first client if exists
    if (clients.length > 0) {
        const firstId = clients[0].id
        console.log(`\n--- Unbilled Tasks for Client ${clients[0].name} ---`)
        const tasks = await prisma.task.findMany({
            where: { clientId: firstId, invoiceStatus: 'UNBILLED' },
            take: 5
        })
        tasks.forEach(t => {
            console.log(`- [${t.id}] ${t.title}: $${t.jobPriceUSD}`)
        })
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect())
