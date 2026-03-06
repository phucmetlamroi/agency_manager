import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debugMapping() {
    try {
        const clients = await prisma.client.findMany({
            select: {
                id: true,
                name: true
            }
        })

        console.log('--- Clients ---')
        console.log(JSON.stringify(clients, null, 2))

        const projects = await prisma.project.findMany({
            where: {
                clientUserId: { not: null }
            },
            select: {
                clientId: true,
                clientUserId: true,
                clientUser: {
                    select: {
                        username: true
                    }
                }
            }
        })

        console.log('--- Project to User Mapping ---')
        console.log(JSON.stringify(projects, null, 2))

    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

debugMapping()
