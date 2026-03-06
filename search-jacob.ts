import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function searchJacobTasks() {
    try {
        const tasks = await prisma.task.findMany({
            where: {
                OR: [
                    { clientId: 1 },
                    { title: { contains: 'Jacob', mode: 'insensitive' } }
                ]
            }
        })
        console.log(`Found ${tasks.length} tasks for Jacob searching by clientId=1 or title contains "Jacob"`)
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

searchJacobTasks()
