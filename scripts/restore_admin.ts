
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const admin = await prisma.user.update({
        where: { username: 'admin' },
        data: {
            role: 'ADMIN',
            isTreasurer: true
        }
    })

    console.log('--- ADMIN RESTORED ---')
    console.log(`Username: ${admin.username}`)
    console.log(`New Role: ${admin.role}`)
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
