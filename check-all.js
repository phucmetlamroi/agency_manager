const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAll() {
    const users = await prisma.user.findMany({
        include: {
            tasks: true,
            bonuses: true
        }
    });

    for (const user of users) {
        if (user.username === 'admin') continue;

        let totalAllTasks = 0;
        let totalCompletedAllTime = 0;

        let sumCompletedFeb = 0;
        let sumCompletedMarch = 0;

        let sumAnyStatusFeb = 0; // Maybe they manually count "Đang thực hiện" or "Review"?

        user.tasks.forEach(t => {
            totalAllTasks += Number(t.value);

            const d = new Date(t.updatedAt);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const val = Number(t.value);

            if (t.status === 'Hoàn tất') {
                totalCompletedAllTime += val;
                if (m === 2 && y === 2026) sumCompletedFeb += val;
                if (m === 3 && y === 2026) sumCompletedMarch += val;
            }

            if (m === 2 && y === 2026) {
                sumAnyStatusFeb += val;
            }
        });

        // Only print if there's significant money
        if (totalAllTasks > 0) {
            console.log(`\n=== User: ${user.username} (Nickname: ${user.nickname}) ===`);
            console.log(`Sum Completed Feb: ${sumCompletedFeb.toLocaleString()}`);
            console.log(`Sum Completed March: ${sumCompletedMarch.toLocaleString()}`);
            console.log(`Sum All Status Feb: ${sumAnyStatusFeb.toLocaleString()}`);
            console.log(`Total ALL Tasks Ever: ${totalAllTasks.toLocaleString()}`);
        }
    }
}

checkAll().finally(() => prisma.$disconnect());
