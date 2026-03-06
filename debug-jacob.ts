import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugJacob() {
    try {
        const jacobUser = await prisma.user.findUnique({ where: { username: 'Jacob' } })
        console.log('Jacob User ID:', jacobUser?.id)

        const jacobClient = await prisma.client.findFirst({ where: { name: 'Jacob' } })
        console.log('Jacob Client ID:', jacobClient?.id)

        const tasksByClient = await prisma.task.findMany({
            where: { clientId: jacobClient?.id },
            select: { id: true, title: true, clientUserId: true }
        })
        console.log(`Tasks with clientId=${jacobClient?.id}:`, tasksByClient.length)
        if (tasksByClient.length > 0) {
            console.log(JSON.stringify(tasksByClient, null, 2))
        }

        const tasksByUser = await prisma.task.findMany({
            where: { clientUserId: jacobUser?.id },
            select: { id: true, title: true }
        })
        console.log(`Tasks with clientUserId=${jacobUser?.id}:`, tasksByUser.length)

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

debugJacob()
