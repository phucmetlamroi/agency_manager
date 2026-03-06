import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkHarrison() {
    try {
        const u = await prisma.user.findUnique({ where: { username: 'Harrison' } })
        console.log('Harrison User ID:', u?.id)

        const tasks = await prisma.task.findMany({
            where: { clientUserId: u?.id },
            select: { id: true, title: true }
        })
        console.log(`Harrison (User) has ${tasks.length} tasks.`)

        const c = await prisma.client.findFirst({ where: { name: 'Harrison' } })
        console.log('Harrison Client ID:', c?.id)

        const tasksByClient = await prisma.task.findMany({
            where: { clientId: c?.id },
            select: { id: true, title: true }
        })
        console.log(`Harrison (Client Record) has ${tasksByClient.length} tasks.`)

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

checkHarrison()
