import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkInvoices() {
    try {
        const count = await prisma.invoice.count()
        console.log(`Total Invoices: ${count}`)

        const invoices = await prisma.invoice.findMany({
            take: 10,
            select: {
                id: true,
                invoiceNumber: true,
                clientId: true,
                clientUserId: true
            }
        })
        console.log('--- Invoices ---')
        console.log(JSON.stringify(invoices, null, 2))
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkInvoices()
