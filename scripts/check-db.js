const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true, profileId: true }
    })
    console.log('Users:', JSON.stringify(users, null, 2))
    const profiles = await prisma.profile.findMany()
    console.log('Profiles:', JSON.stringify(profiles, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())
