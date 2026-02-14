
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    const admin = await prisma.user.findUnique({
        where: { username: 'admin' }
    })

    console.log('--- ADMIN USER CHECK ---')
    if (!admin) {
        console.log('User "admin" NOT FOUND in database!')
    } else {
        console.log(`ID: ${admin.id}`)
        console.log(`Username: ${admin.username}`)
        console.log(`Role: ${admin.role}`)
        console.log(`IsTreasurer: ${admin.isTreasurer}`)
        console.log(`AgencyId: ${admin.agencyId}`)
    }
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
