const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixProductionDb() {
    const currentMonth = 2;
    const currentYear = 2026;
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 5, 23, 59, 59, 999);

    console.log("1. Deleting old bonuses & locks...");
    await prisma.monthlyBonus.deleteMany({
        where: { month: currentMonth, year: currentYear }
    });
    await prisma.payrollLock.deleteMany({
        where: { month: currentMonth, year: currentYear }
    });

    console.log("2. Fetching users...");
    const users = await prisma.user.findMany({
        where: {
            role: { not: 'ADMIN' },
            username: { notIn: ['admin', 'Bảo Phúc', 'Daniel Hee'] }
        },
        include: {
            tasks: {
                where: {
                    status: 'Hoàn tất',
                    updatedAt: { gte: startOfMonth, lte: endOfMonth }
                }
            }
        }
    });

    const rankings = [];

    for (const user of users) {
        if (user.tasks.length === 0) continue;

        const revenue = user.tasks.reduce((sum, task) => {
            const val = task.value ? Number(task.value) : 0;
            return sum + val;
        }, 0);

        let totalExecutionMs = 0;
        for (const task of user.tasks) {
            const activeSeconds = task.accumulatedSeconds || 0;
            totalExecutionMs += (activeSeconds * 1000);
        }
        const executionTimeHours = totalExecutionMs > 0 ? totalExecutionMs / (1000 * 60 * 60) : 0.001;

        rankings.push({
            userId: user.id,
            revenue,
            executionTimeHours
        });
    }

    rankings.sort((a, b) => {
        if (Math.abs(b.revenue - a.revenue) > 0.01) {
            return b.revenue - a.revenue;
        }
        const efficiencyA = a.revenue / a.executionTimeHours;
        const efficiencyB = b.revenue / b.executionTimeHours;
        return efficiencyB - efficiencyA;
    });

    console.log("3. Creating new bonuses...");
    const bonusPercentages = [0.15, 0.10, 0.05];
    for (let i = 0; i < Math.min(3, rankings.length); i++) {
        const user = rankings[i];
        const rank = i + 1;
        const bonusAmount = user.revenue * bonusPercentages[i];

        await prisma.monthlyBonus.create({
            data: {
                userId: user.userId,
                month: currentMonth,
                year: currentYear,
                rank,
                revenue: user.revenue,
                executionTimeHours: user.executionTimeHours,
                bonusAmount
            }
        });
    }

    console.log("4. Relocking...");
    // Just lock it with some admin ID, the first admin
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (admin) {
        await prisma.payrollLock.create({
            data: {
                month: currentMonth,
                year: currentYear,
                isLocked: true,
                lockedBy: admin.id
            }
        });
    }

    console.log("SUCCESS!");
}

fixProductionDb().catch(console.error).finally(() => prisma.$disconnect());
