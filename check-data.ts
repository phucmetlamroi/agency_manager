import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkData() {
    try {
        const sampleTasks = await prisma.task.findMany({
            take: 5,
            select: {
                id: true,
                title: true,
                clientId: true,
                clientUserId: true
            }
        })
        console.log('--- Sample Tasks ---')
        console.log(JSON.stringify(sampleTasks, null, 2))

        const sampleInvoices = await prisma.invoice.findMany({
            take: 5,
            select: {
                id: true,
                invoiceNumber: true,
                clientId: true,
                clientUserId: true
            }
        })
        console.log('--- Sample Invoices ---')
        console.log(JSON.stringify(sampleInvoices, null, 2))

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkData()
