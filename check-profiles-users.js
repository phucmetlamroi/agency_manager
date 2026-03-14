const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { username: true, role: true, profileId: true }
    });
    console.log('Users and Roles/Profiles:', JSON.stringify(users, null, 2));

    const profiles = await prisma.profile.findMany();
    console.log('Profiles:', JSON.stringify(profiles, null, 2));
}

main().catch(console.error);
