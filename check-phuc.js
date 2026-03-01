const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { username: { contains: 'phuc', mode: 'insensitive' } },
                { nickname: { contains: 'phuc', mode: 'insensitive' } }
            ]
        },
        include: {
            tasks: {
                orderBy: { updatedAt: 'desc' }
            }
        }
    });

    if (!user) {
        console.log('User not found');
        return;
    }

    console.log(`=== User: ${user.username} (Nickname: ${user.nickname}) ===`);

    let febSum = 0;
    let marchSum = 0;
    let otherSum = 0;

    console.log('--- ALL TASKS ---');
    user.tasks.forEach(t => {
        const d = new Date(t.updatedAt);
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const isCompleted = t.status === 'Hoàn tất';

        console.log(`[${t.status}] ${t.title} - ${t.value} VND - ${t.updatedAt.toISOString()}`);

        if (isCompleted) {
            if (month === 2 && year === 2026) febSum += Number(t.value);
            else if (month === 3 && year === 2026) marchSum += Number(t.value);
            else otherSum += Number(t.value);
        }
    });

    console.log('--- SUMARY (ONLY "Hoàn tất" STATUS) ---');
    console.log(`Feb 2026 Sum: ${febSum.toLocaleString()} VND`);
    console.log(`March 2026 Sum: ${marchSum.toLocaleString()} VND`);
    console.log(`Other Sum: ${otherSum.toLocaleString()} VND`);
}

check().finally(() => prisma.$disconnect());
