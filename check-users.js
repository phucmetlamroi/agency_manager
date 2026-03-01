const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    const users = await prisma.user.findMany({
        select: { id: true, username: true, role: true }
    });

    console.log("--- ALL USERS ---");
    users.forEach(u => {
        console.log(`[${u.username}] - Role: ${u.role}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
