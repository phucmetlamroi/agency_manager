const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPhuc() {
    const user = await prisma.user.findFirst({
        where: { nickname: 'Phúc Phạm' },
        include: { tasks: true }
    });

    if (!user) return console.log('user not found');

    console.log(`=== Tasks for ${user.nickname} ===`);
    user.tasks.forEach(t => {
        if (t.status === 'Hoàn tất') {
            console.log(`Title: ${t.title}`);
            console.log(`Value: ${t.value}`);
            console.log(`UpdatedAt (ISO UTC): ${new Date(t.updatedAt).toISOString()}`);
            console.log(`UpdatedAt (Local String): ${new Date(t.updatedAt).toString()}`);

            const now = new Date();
            const startOfMarch = new Date(now.getFullYear(), 2, 1);
            const endOfFebruary = new Date(now.getFullYear(), 2, 0, 23, 59, 59, 999);

            console.log(`Is in March according to payroll page? ${t.updatedAt >= startOfMarch}`);
            console.log('---');
        }
    });
}

checkPhuc().finally(() => prisma.$disconnect());
