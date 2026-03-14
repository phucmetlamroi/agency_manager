const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { username: true, role: true }
    });
    console.log('Users and Roles:', JSON.stringify(users, null, 2));
}

main().catch(console.error);
