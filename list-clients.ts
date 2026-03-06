import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function listClients() {
    try {
        const clients = await prisma.user.findMany({
            where: {
                role: 'CLIENT'
            },
            select: {
                username: true,
                plainPassword: true
            }
        })
        console.log('--- List of CLIENT users with Plain Passwords ---')
        console.log(JSON.stringify(clients, null, 2))
    } catch (err) {
        console.error(err)
    } finally {
        await prisma.$disconnect()
    }
}

listClients()
