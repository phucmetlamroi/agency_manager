const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testFilter() {
    // Exact copy of the filter in src/actions/bonus-actions.ts
    const users = await prisma.user.findMany({
        where: {
            role: { not: 'ADMIN' },
            username: { notIn: ['admin', 'Bảo Phúc', 'Daniel Hee'] }
        },
        select: {
            id: true,
            username: true,
            role: true
        }
    });

    console.log(`Found ${users.length} users after filtering:`);
    users.forEach(u => console.log(`- [${u.username}] Role: ${u.role}`));
}

testFilter()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
